package controller

import (
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/ratio_setting"

	"github.com/gin-gonic/gin"
)

type upstreamPricingModel struct {
	ModelName       string  `json:"model_name"`
	QuotaType       int     `json:"quota_type"`
	ModelRatio      float64 `json:"model_ratio"`
	ModelPrice      float64 `json:"model_price"`
	CompletionRatio float64 `json:"completion_ratio"`
}

type upstreamPricingResponse struct {
	Success bool                   `json:"success"`
	Data    []upstreamPricingModel `json:"data"`
}

// fetchUpstreamPricing fetches /api/pricing from a channel's base URL
func fetchUpstreamPricing(baseURL string) ([]upstreamPricingModel, error) {
	url := strings.TrimRight(baseURL, "/") + "/api/pricing"

	client := service.GetHttpClient()
	resp, err := client.Get(url)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch pricing from %s: %w", url, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("upstream returned status %d", resp.StatusCode)
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, 10<<20))
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	var pricingResp upstreamPricingResponse
	if err := common.Unmarshal(body, &pricingResp); err != nil {
		return nil, fmt.Errorf("failed to parse pricing response: %w", err)
	}

	if !pricingResp.Success {
		return nil, fmt.Errorf("upstream pricing API returned success=false")
	}

	return pricingResp.Data, nil
}

// syncPricingForModels syncs pricing from upstream for the given models.
// If modelNames is nil, syncs ALL models from upstream.
// Returns counts of updated model_ratio, completion_ratio, model_price entries.
func syncPricingForModels(baseURL string, modelNames []string) (ratioUpdated, compUpdated, priceUpdated int, err error) {
	upstreamModels, err := fetchUpstreamPricing(baseURL)
	if err != nil {
		return 0, 0, 0, err
	}

	// Build lookup from upstream
	upstreamByName := make(map[string]upstreamPricingModel, len(upstreamModels))
	for _, m := range upstreamModels {
		upstreamByName[m.ModelName] = m
	}

	// Determine which models to sync
	var targetModels []string
	if modelNames != nil {
		targetModels = modelNames
	} else {
		targetModels = make([]string, 0, len(upstreamModels))
		for _, m := range upstreamModels {
			targetModels = append(targetModels, m.ModelName)
		}
	}

	// Read current ratio maps
	currentModelRatio := ratio_setting.GetModelRatioCopy()
	currentCompletionRatio := ratio_setting.GetCompletionRatioCopy()
	currentModelPrice := ratio_setting.GetModelPriceCopy()

	// Merge upstream pricing into current maps
	ratioChanged := false
	compChanged := false
	priceChanged := false

	for _, name := range targetModels {
		upstream, ok := upstreamByName[name]
		if !ok {
			continue
		}

		if upstream.QuotaType == 1 {
			// Fixed price model
			if upstream.ModelPrice > 0 {
				if existing, exists := currentModelPrice[name]; !exists || existing != upstream.ModelPrice {
					currentModelPrice[name] = upstream.ModelPrice
					priceChanged = true
					priceUpdated++
				}
			}
		} else {
			// Ratio-based model
			if upstream.ModelRatio > 0 {
				if existing, exists := currentModelRatio[name]; !exists || existing != upstream.ModelRatio {
					currentModelRatio[name] = upstream.ModelRatio
					ratioChanged = true
					ratioUpdated++
				}
			}
			if upstream.CompletionRatio > 0 {
				if existing, exists := currentCompletionRatio[name]; !exists || existing != upstream.CompletionRatio {
					currentCompletionRatio[name] = upstream.CompletionRatio
					compChanged = true
					compUpdated++
				}
			}
		}
	}

	// Persist changes
	if ratioChanged {
		jsonStr, _ := common.Marshal(currentModelRatio)
		if err := model.UpdateOption("ModelRatio", string(jsonStr)); err != nil {
			return ratioUpdated, compUpdated, priceUpdated, fmt.Errorf("failed to save ModelRatio: %w", err)
		}
		if err := ratio_setting.UpdateModelRatioByJSONString(string(jsonStr)); err != nil {
			return ratioUpdated, compUpdated, priceUpdated, fmt.Errorf("failed to update ModelRatio in memory: %w", err)
		}
	}

	if compChanged {
		jsonStr, _ := common.Marshal(currentCompletionRatio)
		if err := model.UpdateOption("CompletionRatio", string(jsonStr)); err != nil {
			return ratioUpdated, compUpdated, priceUpdated, fmt.Errorf("failed to save CompletionRatio: %w", err)
		}
		if err := ratio_setting.UpdateCompletionRatioByJSONString(string(jsonStr)); err != nil {
			return ratioUpdated, compUpdated, priceUpdated, fmt.Errorf("failed to update CompletionRatio in memory: %w", err)
		}
	}

	if priceChanged {
		jsonStr, _ := common.Marshal(currentModelPrice)
		if err := model.UpdateOption("ModelPrice", string(jsonStr)); err != nil {
			return ratioUpdated, compUpdated, priceUpdated, fmt.Errorf("failed to save ModelPrice: %w", err)
		}
		if err := ratio_setting.UpdateModelPriceByJSONString(string(jsonStr)); err != nil {
			return ratioUpdated, compUpdated, priceUpdated, fmt.Errorf("failed to update ModelPrice in memory: %w", err)
		}
	}

	return ratioUpdated, compUpdated, priceUpdated, nil
}

// SyncChannelUpstreamPricing is the API handler for syncing pricing from a channel's upstream
func SyncChannelUpstreamPricing(c *gin.Context) {
	var req struct {
		ID     int      `json:"id"`
		Models []string `json:"models"` // nil/empty = sync all
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, err)
		return
	}
	if req.ID <= 0 {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "invalid channel id"})
		return
	}

	channel, err := model.GetChannelById(req.ID, true)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	baseURL := channel.GetBaseURL()
	if baseURL == "" {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "channel has no base URL configured"})
		return
	}

	var models []string
	if len(req.Models) > 0 {
		models = req.Models
	}

	ratioUpdated, compUpdated, priceUpdated, err := syncPricingForModels(baseURL, models)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": fmt.Sprintf("sync pricing failed: %v", err),
		})
		return
	}

	total := ratioUpdated + compUpdated + priceUpdated
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": fmt.Sprintf("synced pricing: %d model ratios, %d completion ratios, %d fixed prices updated", ratioUpdated, compUpdated, priceUpdated),
		"data": gin.H{
			"model_ratio_updated":      ratioUpdated,
			"completion_ratio_updated":  compUpdated,
			"model_price_updated":       priceUpdated,
			"total_updated":             total,
		},
	})
}

// syncPricingOnModelAdd is called internally during upstream model apply
// to auto-sync pricing for newly added models
func syncPricingOnModelAdd(channel *model.Channel, addedModels []string) {
	if len(addedModels) == 0 {
		return
	}

	baseURL := channel.GetBaseURL()
	if baseURL == "" {
		return
	}

	ratioUpdated, compUpdated, priceUpdated, err := syncPricingForModels(baseURL, addedModels)
	if err != nil {
		common.SysLog(fmt.Sprintf("auto pricing sync failed for channel %d: %v", channel.Id, err))
		return
	}

	total := ratioUpdated + compUpdated + priceUpdated
	if total > 0 {
		common.SysLog(fmt.Sprintf("auto pricing sync for channel %d: %d model ratios, %d completion ratios, %d fixed prices synced for %d new models",
			channel.Id, ratioUpdated, compUpdated, priceUpdated, len(addedModels)))
	}
}
