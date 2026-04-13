package model

import (
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
)

// In-memory cache fallback when Redis is not available
var monthlyStatsCache = struct {
	sync.RWMutex
	items map[string]memoryCacheItem
}{items: make(map[string]memoryCacheItem)}

type memoryCacheItem struct {
	data      string // JSON-encoded
	expiresAt time.Time
}

const (
	monthlyStatsCachePrefix        = "monthly_stat:total:"
	monthlyChannelStatsCachePrefix = "monthly_stat:channel:"
	// Completed months never change — cache for 24 hours
	historicalCacheTTL = 24 * time.Hour
	// Current month changes constantly — cache for 5 minutes
	currentMonthCacheTTL = 5 * time.Minute
)

// memCacheGet retrieves a value from the in-memory cache.
func memCacheGet(key string) (string, bool) {
	monthlyStatsCache.RLock()
	item, ok := monthlyStatsCache.items[key]
	monthlyStatsCache.RUnlock()
	if !ok || time.Now().After(item.expiresAt) {
		if ok {
			// Expired — clean up
			monthlyStatsCache.Lock()
			delete(monthlyStatsCache.items, key)
			monthlyStatsCache.Unlock()
		}
		return "", false
	}
	return item.data, true
}

// memCacheSet stores a value in the in-memory cache with TTL.
func memCacheSet(key string, value string, ttl time.Duration) {
	monthlyStatsCache.Lock()
	monthlyStatsCache.items[key] = memoryCacheItem{
		data:      value,
		expiresAt: time.Now().Add(ttl),
	}
	monthlyStatsCache.Unlock()
}

// cacheGet attempts to read from Redis first, then falls back to in-memory cache.
func statsCacheGet(key string) (string, bool) {
	if common.RedisEnabled {
		val, err := common.RedisGet(key)
		if err == nil && val != "" {
			return val, true
		}
		return "", false
	}
	return memCacheGet(key)
}

// cacheSet writes to Redis if available, otherwise to in-memory cache.
func statsCacheSet(key string, value string, ttl time.Duration) {
	if common.RedisEnabled {
		_ = common.RedisSet(key, value, ttl)
		return
	}
	memCacheSet(key, value, ttl)
}

// getMonthsBetween returns all YYYY-MM strings between two unix timestamps (inclusive).
func getMonthsBetween(startTimestamp, endTimestamp int64) []string {
	start := time.Unix(startTimestamp, 0)
	end := time.Unix(endTimestamp, 0)

	var months []string
	cur := time.Date(start.Year(), start.Month(), 1, 0, 0, 0, 0, time.Local)
	endMonth := time.Date(end.Year(), end.Month(), 1, 0, 0, 0, 0, time.Local)

	for !cur.After(endMonth) {
		months = append(months, cur.Format("2006-01"))
		cur = cur.AddDate(0, 1, 0)
	}
	return months
}

// monthTimestampRange returns the unix timestamp range [start, end) for a given YYYY-MM month string.
func monthTimestampRange(ym string) (int64, int64) {
	t, err := time.ParseInLocation("2006-01", ym, time.Local)
	if err != nil {
		return 0, 0
	}
	start := t.Unix()
	end := t.AddDate(0, 1, 0).Unix() - 1
	return start, end
}

// GetMonthlyStatsWithCache wraps GetMonthlyStats with per-month caching.
// Completed months are cached for 24h; current month is cached for 5min.
func GetMonthlyStatsWithCache(startTimestamp, endTimestamp int64) ([]MonthlyStat, error) {
	months := getMonthsBetween(startTimestamp, endTimestamp)
	currentMonth := time.Now().Format("2006-01")

	var allStats []MonthlyStat
	var uncachedStart, uncachedEnd int64
	hasUncached := false

	for _, m := range months {
		cacheKey := monthlyStatsCachePrefix + m
		if cached, ok := statsCacheGet(cacheKey); ok {
			var stats []MonthlyStat
			if err := common.Unmarshal([]byte(cached), &stats); err == nil {
				allStats = append(allStats, stats...)
				continue
			}
		}
		// Need to query this month
		mStart, mEnd := monthTimestampRange(m)
		// Clamp to the original query range
		if mStart < startTimestamp {
			mStart = startTimestamp
		}
		if mEnd > endTimestamp {
			mEnd = endTimestamp
		}
		if !hasUncached {
			uncachedStart = mStart
			uncachedEnd = mEnd
			hasUncached = true
		} else {
			if mStart < uncachedStart {
				uncachedStart = mStart
			}
			if mEnd > uncachedEnd {
				uncachedEnd = mEnd
			}
		}
	}

	if hasUncached {
		freshStats, err := GetMonthlyStats(uncachedStart, uncachedEnd)
		if err != nil {
			return nil, err
		}
		// Group by month for caching
		byMonth := make(map[string][]MonthlyStat)
		for _, s := range freshStats {
			byMonth[s.Month] = append(byMonth[s.Month], s)
		}
		// Cache each month
		for m, stats := range byMonth {
			ttl := historicalCacheTTL
			if m == currentMonth {
				ttl = currentMonthCacheTTL
			}
			data, err := common.Marshal(stats)
			if err == nil {
				statsCacheSet(monthlyStatsCachePrefix+m, string(data), ttl)
			}
		}
		allStats = append(allStats, freshStats...)
	}

	// Sort by month ascending
	sortMonthlyStats(allStats)
	return allStats, nil
}

// GetMonthlyStatsByChannelWithCache wraps GetMonthlyStatsByChannel with per-month caching.
func GetMonthlyStatsByChannelWithCache(startTimestamp, endTimestamp int64) ([]MonthlyStatByChannel, error) {
	months := getMonthsBetween(startTimestamp, endTimestamp)
	currentMonth := time.Now().Format("2006-01")

	var allStats []MonthlyStatByChannel
	var uncachedStart, uncachedEnd int64
	hasUncached := false

	for _, m := range months {
		cacheKey := monthlyChannelStatsCachePrefix + m
		if cached, ok := statsCacheGet(cacheKey); ok {
			var stats []MonthlyStatByChannel
			if err := common.Unmarshal([]byte(cached), &stats); err == nil {
				allStats = append(allStats, stats...)
				continue
			}
		}
		mStart, mEnd := monthTimestampRange(m)
		if mStart < startTimestamp {
			mStart = startTimestamp
		}
		if mEnd > endTimestamp {
			mEnd = endTimestamp
		}
		if !hasUncached {
			uncachedStart = mStart
			uncachedEnd = mEnd
			hasUncached = true
		} else {
			if mStart < uncachedStart {
				uncachedStart = mStart
			}
			if mEnd > uncachedEnd {
				uncachedEnd = mEnd
			}
		}
	}

	if hasUncached {
		freshStats, err := GetMonthlyStatsByChannel(uncachedStart, uncachedEnd)
		if err != nil {
			return nil, err
		}
		byMonth := make(map[string][]MonthlyStatByChannel)
		for _, s := range freshStats {
			byMonth[s.Month] = append(byMonth[s.Month], s)
		}
		for m, stats := range byMonth {
			ttl := historicalCacheTTL
			if m == currentMonth {
				ttl = currentMonthCacheTTL
			}
			data, err := common.Marshal(stats)
			if err == nil {
				statsCacheSet(monthlyChannelStatsCachePrefix+m, string(data), ttl)
			}
		}
		allStats = append(allStats, freshStats...)
	}

	sortMonthlyStatsByChannel(allStats)
	return allStats, nil
}

func sortMonthlyStats(stats []MonthlyStat) {
	for i := 1; i < len(stats); i++ {
		for j := i; j > 0 && stats[j].Month < stats[j-1].Month; j-- {
			stats[j], stats[j-1] = stats[j-1], stats[j]
		}
	}
}

func sortMonthlyStatsByChannel(stats []MonthlyStatByChannel) {
	for i := 1; i < len(stats); i++ {
		for j := i; j > 0; j-- {
			if stats[j].Month < stats[j-1].Month ||
				(stats[j].Month == stats[j-1].Month && stats[j].Quota > stats[j-1].Quota) {
				stats[j], stats[j-1] = stats[j-1], stats[j]
			} else {
				break
			}
		}
	}
}
