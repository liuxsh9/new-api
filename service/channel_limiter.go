package service

import (
	"strconv"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
)

const (
	limiterWindowDuration = 30 * time.Second // sliding window size
	limiterThreshold      = 100              // 429 count to trigger cooldown
	limiterBaseCooldown   = 30 * time.Second // initial cooldown duration
	limiterMaxCooldown    = 5 * time.Minute  // max cooldown duration
	limiterSuccessToReset = 5                // consecutive successes to fully reset
)

// limiterKey is channel + model, so rate limiting on one model doesn't block others on the same channel.
type limiterKey struct {
	channelId int
	model     string
}

type channelModelState struct {
	errors429     []time.Time // timestamps of recent 429 errors
	cooldownUntil time.Time   // when cooldown expires
	cooldownLevel int         // exponential backoff level
	successStreak int         // consecutive successes since last 429
}

type ChannelLimiter struct {
	mu    sync.RWMutex
	state map[limiterKey]*channelModelState
}

var ChannelLimiterInstance = &ChannelLimiter{
	state: make(map[limiterKey]*channelModelState),
}

// Allow checks if a channel+model pair is allowed to process requests.
func (cl *ChannelLimiter) Allow(channelId int, model string) bool {
	key := limiterKey{channelId, model}

	cl.mu.RLock()
	s, exists := cl.state[key]
	cl.mu.RUnlock()

	if !exists {
		return true
	}

	now := time.Now()
	if now.Before(s.cooldownUntil) {
		common.SysLog("channel " + strconv.Itoa(channelId) + " model " + model +
			" is in cooldown, rejecting request (expires in " +
			s.cooldownUntil.Sub(now).Truncate(time.Second).String() + ")")
		return false
	}

	return true
}

// Record429 records a 429 error for the given channel+model.
// If the threshold is exceeded within the window, triggers cooldown.
func (cl *ChannelLimiter) Record429(channelId int, model string) {
	key := limiterKey{channelId, model}

	cl.mu.Lock()
	defer cl.mu.Unlock()

	now := time.Now()
	s, exists := cl.state[key]
	if !exists {
		s = &channelModelState{}
		cl.state[key] = s
	}

	s.successStreak = 0
	s.errors429 = append(s.errors429, now)

	// Trim old entries outside the window
	cutoff := now.Add(-limiterWindowDuration)
	trimIdx := 0
	for trimIdx < len(s.errors429) && s.errors429[trimIdx].Before(cutoff) {
		trimIdx++
	}
	if trimIdx > 0 {
		s.errors429 = s.errors429[trimIdx:]
	}

	// Check threshold
	if len(s.errors429) >= limiterThreshold && now.After(s.cooldownUntil) {
		cooldown := limiterBaseCooldown * (1 << s.cooldownLevel)
		if cooldown > limiterMaxCooldown {
			cooldown = limiterMaxCooldown
		}
		s.cooldownUntil = now.Add(cooldown)
		s.cooldownLevel++
		s.errors429 = nil // reset window

		common.SysError("channel " + strconv.Itoa(channelId) + " model " + model +
			" entering cooldown for " + cooldown.Truncate(time.Second).String() +
			" (level " + strconv.Itoa(s.cooldownLevel) + ") due to " +
			strconv.Itoa(limiterThreshold) + " upstream 429 errors in " + limiterWindowDuration.String())
	}
}

// RecordSuccess records a successful response for the given channel+model.
func (cl *ChannelLimiter) RecordSuccess(channelId int, model string) {
	key := limiterKey{channelId, model}

	cl.mu.Lock()
	defer cl.mu.Unlock()

	s, exists := cl.state[key]
	if !exists {
		return
	}

	s.successStreak++
	if s.successStreak >= limiterSuccessToReset {
		delete(cl.state, key)
	}
}
