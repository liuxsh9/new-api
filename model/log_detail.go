package model

import (
	"os"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/bytedance/gopkg/util/gopool"
	"github.com/gin-gonic/gin"
)

// LogDetail stores metadata and optionally compressed request/response for audit
// Full content is primarily stored in log files for performance
type LogDetail struct {
	Id               int    `json:"id" gorm:"primaryKey"`
	RequestId        string `json:"request_id" gorm:"type:varchar(64);uniqueIndex;not null"`
	UserId           int    `json:"user_id" gorm:"index"`
	CreatedAt        int64  `json:"created_at" gorm:"bigint;index"`
	// Store compressed data in DB only if DB_DETAIL_STORAGE=true
	RequestBodyGz    []byte `json:"-" gorm:"column:request_body_gz"`
	ResponseBodyGz   []byte `json:"-" gorm:"column:response_body_gz"`
	UpstreamReqGz    []byte `json:"-" gorm:"column:upstream_req_gz"`
	UpstreamRespGz   []byte `json:"-" gorm:"column:upstream_resp_gz"`
	// For JSON response, decompress on-the-fly
	RequestBody      string `json:"request_body" gorm:"-"`
	ResponseBody     string `json:"response_body" gorm:"-"`
	UpstreamRequest  string `json:"upstream_request" gorm:"-"`
	UpstreamResponse string `json:"upstream_response" gorm:"-"`
}

func (LogDetail) TableName() string {
	return "log_details"
}

type RecordLogDetailParams struct {
	RequestId        string
	UserId           int
	RequestBody      string
	ResponseBody     string
	UpstreamRequest  string
	UpstreamResponse string
}

var dbDetailStorageEnabled = os.Getenv("DB_DETAIL_STORAGE") == "true"

// RecordLogDetail records full request/response details asynchronously
// Writes to log file (always) and optionally to DB (if DB_DETAIL_STORAGE=true)
func RecordLogDetail(c *gin.Context, params RecordLogDetailParams) {
	// Copy context before async goroutine - gin.Context is recycled after request ends
	ctx := c.Copy()
	// Use gopool for async write to avoid blocking main request flow
	gopool.Go(func() {
		// Always write to log file (fast, for archival)
		if err := logger.WriteDetailLog(
			params.RequestId,
			params.UserId,
			params.RequestBody,
			params.ResponseBody,
			params.UpstreamRequest,
			params.UpstreamResponse,
		); err != nil {
			logger.LogError(ctx, "failed to write detail log file: "+err.Error())
		}

		// Optionally write to DB (for dashboard query)
		if dbDetailStorageEnabled {
			// Compress data before storing in DB
			reqGz, _ := logger.CompressJSON(params.RequestBody)
			respGz, _ := logger.CompressJSON(params.ResponseBody)
			upReqGz, _ := logger.CompressJSON(params.UpstreamRequest)
			upRespGz, _ := logger.CompressJSON(params.UpstreamResponse)

			logDetail := &LogDetail{
				RequestId:      params.RequestId,
				UserId:         params.UserId,
				CreatedAt:      common.GetTimestamp(),
				RequestBodyGz:  reqGz,
				ResponseBodyGz: respGz,
				UpstreamReqGz:  upReqGz,
				UpstreamRespGz: upRespGz,
			}

			err := LOG_DB.Create(logDetail).Error
			if err != nil {
				logger.LogError(ctx, "failed to record log detail to DB: "+err.Error())
			}
		}
	})
}

// GetLogDetailByRequestId retrieves full log details by request_id
func GetLogDetailByRequestId(requestId string) (*LogDetail, error) {
	var logDetail LogDetail
	err := LOG_DB.Where("request_id = ?", requestId).First(&logDetail).Error
	if err != nil {
		return nil, err
	}

	// Decompress data for response
	if len(logDetail.RequestBodyGz) > 0 {
		logDetail.RequestBody, _ = logger.DecompressJSON(logDetail.RequestBodyGz)
	}
	if len(logDetail.ResponseBodyGz) > 0 {
		logDetail.ResponseBody, _ = logger.DecompressJSON(logDetail.ResponseBodyGz)
	}
	if len(logDetail.UpstreamReqGz) > 0 {
		logDetail.UpstreamRequest, _ = logger.DecompressJSON(logDetail.UpstreamReqGz)
	}
	if len(logDetail.UpstreamRespGz) > 0 {
		logDetail.UpstreamResponse, _ = logger.DecompressJSON(logDetail.UpstreamRespGz)
	}

	return &logDetail, nil
}

// DeleteOldLogDetails deletes log details older than targetTimestamp
func DeleteOldLogDetails(targetTimestamp int64, limit int) (int64, error) {
	if !dbDetailStorageEnabled {
		return 0, nil
	}

	var total int64 = 0

	for {
		result := LOG_DB.Where("created_at < ?", targetTimestamp).Limit(limit).Delete(&LogDetail{})
		if result.Error != nil {
			return total, result.Error
		}

		total += result.RowsAffected

		if result.RowsAffected < int64(limit) {
			break
		}
	}

	return total, nil
}
