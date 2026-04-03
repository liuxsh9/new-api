package relay

import (
	"bytes"
	"io"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/gin-gonic/gin"
)

// captureRequestBody captures the request body for logging
func captureRequestBody(c *gin.Context) string {
	if !logger.IsDetailLogEnabled() {
		return ""
	}

	storage, err := common.GetBodyStorage(c)
	if err != nil {
		return ""
	}

	bodyBytes, err := storage.Bytes()
	if err != nil {
		return ""
	}

	return string(bodyBytes)
}

// captureUpstreamRequest captures the upstream request body
func captureUpstreamRequest(requestBody io.Reader) (io.Reader, string) {
	if !logger.IsDetailLogEnabled() {
		return requestBody, ""
	}

	if requestBody == nil {
		return nil, ""
	}

	// Read the body
	bodyBytes, err := io.ReadAll(requestBody)
	if err != nil {
		return requestBody, ""
	}

	// Return a new reader and the captured string
	return bytes.NewReader(bodyBytes), string(bodyBytes)
}

// recordDetailLog records detailed request/response log asynchronously
func recordDetailLog(c *gin.Context, info *relaycommon.RelayInfo, clientReq, clientResp, upstreamReq, upstreamResp string) {
	if !logger.IsDetailLogEnabled() {
		return
	}

	requestId := c.GetString(common.RequestIdKey)
	if requestId == "" {
		return
	}

	model.RecordLogDetail(c, model.RecordLogDetailParams{
		RequestId:        requestId,
		UserId:           info.UserId,
		RequestBody:      clientReq,
		ResponseBody:     clientResp,
		UpstreamRequest:  upstreamReq,
		UpstreamResponse: upstreamResp,
	})
}
