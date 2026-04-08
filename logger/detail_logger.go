package logger

import (
	"bytes"
	"compress/gzip"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"

	"github.com/QuantumNous/new-api/common"
)

var (
	detailLogDir = "/app/logs/details"
	detailLogCh  chan detailLogEntry
)

type detailLogEntry struct {
	line string
}

const detailLogChanSize = 8192

func init() {
	// 环境变量作为启动时的初始值
	if os.Getenv("DETAIL_LOG_ENABLED") == "true" {
		common.DetailLogEnabled = true
	}
	if common.DetailLogEnabled {
		initDetailLog()
	}
	if os.Getenv("DB_DETAIL_STORAGE") == "true" {
		common.DetailLogDBStorageEnabled = true
	}
}

func initDetailLog() {
	detailLogDir = common.GetEnvOrDefaultString("DETAIL_LOG_DIR", "/app/logs/details")

	if err := os.MkdirAll(detailLogDir, 0755); err != nil {
		common.SysLog("failed to create detail log directory: " + err.Error())
		common.DetailLogEnabled = false
		return
	}

	detailLogCh = make(chan detailLogEntry, detailLogChanSize)
	go detailLogWriter()
}

// SetDetailLogEnabled enables or disables detail logging at runtime
func SetDetailLogEnabled(enabled bool) {
	if enabled && !common.DetailLogEnabled {
		// Turning on: initialize writer goroutine
		initDetailLog()
	}
	common.DetailLogEnabled = enabled
}

// detailLogWriter is a single goroutine that drains the channel and writes to file.
// Using a dedicated writer goroutine avoids mutex contention under high concurrency.
func detailLogWriter() {
	var (
		currentFile *os.File
		currentDate string
	)
	defer func() {
		if currentFile != nil {
			currentFile.Close()
		}
	}()

	for entry := range detailLogCh {
		today := time.Now().Format("2006-01-02")
		if currentFile == nil || currentDate != today {
			if currentFile != nil {
				currentFile.Close()
			}
			logPath := filepath.Join(detailLogDir, fmt.Sprintf("detail-%s.log", today))
			var err error
			currentFile, err = os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
			if err != nil {
				common.SysLog("failed to open detail log file: " + err.Error())
				continue
			}
			currentDate = today
		}
		currentFile.WriteString(entry.line)
	}
}

// CompressJSON compresses JSON string using gzip
func CompressJSON(data string) ([]byte, error) {
	if data == "" {
		return nil, nil
	}

	var buf bytes.Buffer
	gz := gzip.NewWriter(&buf)

	if _, err := gz.Write([]byte(data)); err != nil {
		return nil, err
	}

	if err := gz.Close(); err != nil {
		return nil, err
	}

	return buf.Bytes(), nil
}

// maxDecompressSize limits decompressed output to 64MB to prevent zip bombs
const maxDecompressSize = 64 << 20

// DecompressJSON decompresses gzipped JSON data
func DecompressJSON(data []byte) (string, error) {
	if len(data) == 0 {
		return "", nil
	}

	reader, err := gzip.NewReader(bytes.NewReader(data))
	if err != nil {
		return "", err
	}
	defer reader.Close()

	var buf bytes.Buffer
	if _, err := io.Copy(&buf, io.LimitReader(reader, maxDecompressSize)); err != nil {
		return "", err
	}

	return buf.String(), nil
}

// WriteDetailLog writes detailed request/response to daily rotated log file
func WriteDetailLog(requestId string, userId int, requestBody, responseBody, upstreamRequest, upstreamResponse string) error {
	if !common.DetailLogEnabled {
		return nil
	}

	// Use common.Marshal for reliable JSON escaping
	reqBytes, _ := common.Marshal(requestBody)
	respBytes, _ := common.Marshal(responseBody)
	upReqBytes, _ := common.Marshal(upstreamRequest)
	upRespBytes, _ := common.Marshal(upstreamResponse)

	timestamp := time.Now().Unix()
	logEntry := fmt.Sprintf(`{"ts":%d,"rid":"%s","uid":%d,"req":%s,"resp":%s,"up_req":%s,"up_resp":%s}`+"\n",
		timestamp, requestId, userId,
		string(reqBytes),
		string(respBytes),
		string(upReqBytes),
		string(upRespBytes))

	select {
	case detailLogCh <- detailLogEntry{line: logEntry}:
		return nil
	default:
		// Channel full — drop log entry to avoid blocking the request path
		common.SysLog("detail log channel full, dropping entry for request " + requestId)
		return fmt.Errorf("detail log channel full")
	}
}

// IsDetailLogEnabled returns whether detail logging is enabled
func IsDetailLogEnabled() bool {
	return common.DetailLogEnabled
}
