package relay

import (
	"bytes"
	"net/http"

	"github.com/gin-gonic/gin"
)

// maxCaptureSize limits captured response body to 16MB to prevent OOM on huge responses
const maxCaptureSize = 16 << 20

// responseCapture wraps gin.ResponseWriter to capture response body
type responseCapture struct {
	gin.ResponseWriter
	body    *bytes.Buffer
	capped  bool
}

func (rc *responseCapture) Write(b []byte) (int, error) {
	if !rc.capped {
		if rc.body.Len()+len(b) > maxCaptureSize {
			rc.capped = true
		} else {
			rc.body.Write(b)
		}
	}
	return rc.ResponseWriter.Write(b)
}

func (rc *responseCapture) WriteString(s string) (int, error) {
	if !rc.capped {
		if rc.body.Len()+len(s) > maxCaptureSize {
			rc.capped = true
		} else {
			rc.body.WriteString(s)
		}
	}
	return rc.ResponseWriter.WriteString(s)
}

// Flush implements http.Flusher for streaming support
func (rc *responseCapture) Flush() {
	if f, ok := rc.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

// installResponseCapture replaces c.Writer with a capturing wrapper
// Returns a function to retrieve the captured body
func installResponseCapture(c *gin.Context) func() string {
	capture := &responseCapture{
		ResponseWriter: c.Writer,
		body:           &bytes.Buffer{},
	}
	c.Writer = capture
	return func() string {
		return capture.body.String()
	}
}
