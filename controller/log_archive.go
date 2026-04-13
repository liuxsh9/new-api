package controller

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
)

var logArchiveDir string

func init() {
	logArchiveDir = common.GetEnvOrDefaultString("LOG_ARCHIVE_DIR", "/app/logs/archive")
}

// --- Download token management ---

var archiveTokens = struct {
	sync.RWMutex
	tokens map[string]archiveTokenInfo
}{tokens: make(map[string]archiveTokenInfo)}

type archiveTokenInfo struct {
	userId    int
	expiresAt time.Time
}

const archiveTokenTTL = 24 * time.Hour

func generateArchiveToken(userId int) string {
	b := make([]byte, 24)
	_, _ = rand.Read(b)
	token := hex.EncodeToString(b)

	archiveTokens.Lock()
	// Clean expired tokens while we hold the lock
	now := time.Now()
	for k, v := range archiveTokens.tokens {
		if now.After(v.expiresAt) {
			delete(archiveTokens.tokens, k)
		}
	}
	archiveTokens.tokens[token] = archiveTokenInfo{
		userId:    userId,
		expiresAt: now.Add(archiveTokenTTL),
	}
	archiveTokens.Unlock()

	return token
}

func validateArchiveToken(token string) bool {
	archiveTokens.RLock()
	info, ok := archiveTokens.tokens[token]
	archiveTokens.RUnlock()

	if !ok || time.Now().After(info.expiresAt) {
		return false
	}
	return true
}

// CreateArchiveDownloadToken generates a temporary download token (24h).
// POST /api/log/archives/token
func CreateArchiveDownloadToken(c *gin.Context) {
	userId := c.GetInt("id")
	token := generateArchiveToken(userId)

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"token":      token,
			"expires_in": int(archiveTokenTTL.Seconds()),
		},
	})
}

// --- File listing ---

type ArchiveFileInfo struct {
	Name string `json:"name"`
	Size int64  `json:"size"`
	Date string `json:"date"`
	Path string `json:"path"`
}

// ListArchives returns a list of all archive files.
// GET /api/log/archives?month=2026-04
func ListArchives(c *gin.Context) {
	monthFilter := c.Query("month")

	var allFiles []ArchiveFileInfo

	err := filepath.Walk(logArchiveDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		if info.IsDir() {
			return nil
		}
		if !strings.HasSuffix(info.Name(), ".xz") {
			return nil
		}

		relPath, _ := filepath.Rel(logArchiveDir, path)
		date := extractDateFromFilename(info.Name())

		allFiles = append(allFiles, ArchiveFileInfo{
			Name: info.Name(),
			Size: info.Size(),
			Date: date,
			Path: filepath.ToSlash(relPath),
		})
		return nil
	})

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "无法读取归档目录: " + err.Error(),
		})
		return
	}

	monthSet := make(map[string]bool)
	for _, f := range allFiles {
		if len(f.Date) >= 7 {
			monthSet[f.Date[:7]] = true
		}
	}
	var months []string
	for m := range monthSet {
		months = append(months, m)
	}
	sort.Sort(sort.Reverse(sort.StringSlice(months)))

	var files []ArchiveFileInfo
	for _, f := range allFiles {
		if monthFilter != "" {
			month := ""
			if len(f.Date) >= 7 {
				month = f.Date[:7]
			}
			if month != monthFilter {
				continue
			}
		}
		files = append(files, f)
	}

	sort.Slice(files, func(i, j int) bool {
		return files[i].Date > files[j].Date
	})

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"files":  files,
			"months": months,
		},
	})
}

// --- File download ---

// DownloadArchive serves a single archive file with HTTP Range support.
// Supports two auth modes:
//  1. Normal admin session (browser download)
//  2. ?token=xxx temporary download token (script download)
//
// GET /api/log/archives/download?path=...&token=...
func DownloadArchive(c *gin.Context) {
	relPath := c.Query("path")
	if relPath == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "path parameter is required",
		})
		return
	}

	// Security: prevent directory traversal
	cleanPath := filepath.Clean(relPath)
	if strings.Contains(cleanPath, "..") {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "invalid path",
		})
		return
	}

	fullPath := filepath.Join(logArchiveDir, cleanPath)

	absArchiveDir, _ := filepath.Abs(logArchiveDir)
	absFullPath, _ := filepath.Abs(fullPath)
	if !strings.HasPrefix(absFullPath, absArchiveDir+string(os.PathSeparator)) {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "invalid path",
		})
		return
	}

	info, err := os.Stat(fullPath)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"success": false,
			"message": "文件不存在",
		})
		return
	}

	common.SysLog(fmt.Sprintf("archive download: %s (%s)", relPath, formatFileSize(info.Size())))

	c.Header("Content-Disposition", "attachment; filename="+filepath.Base(fullPath))
	http.ServeFile(c.Writer, c.Request, fullPath)
}

// DownloadArchiveWithToken is the token-authenticated version of DownloadArchive.
// It validates the token query parameter before serving the file.
// GET /api/log/archives/download_t?path=...&token=...
func DownloadArchiveWithToken(c *gin.Context) {
	token := c.Query("token")
	if token == "" || !validateArchiveToken(token) {
		c.JSON(http.StatusUnauthorized, gin.H{
			"success": false,
			"message": "下载令牌无效或已过期，请重新生成下载脚本",
		})
		return
	}

	// Delegate to the same download logic
	DownloadArchive(c)
}

// --- Helpers ---

func extractDateFromFilename(name string) string {
	name = strings.TrimSuffix(name, ".xz")
	name = strings.TrimSuffix(name, ".log")
	parts := strings.SplitN(name, "-", 2)
	if len(parts) == 2 {
		return parts[1]
	}
	return name
}

func formatFileSize(size int64) string {
	const (
		KB = 1024
		MB = KB * 1024
		GB = MB * 1024
	)
	switch {
	case size >= GB:
		return fmt.Sprintf("%.1f GB", float64(size)/float64(GB))
	case size >= MB:
		return fmt.Sprintf("%.1f MB", float64(size)/float64(MB))
	case size >= KB:
		return fmt.Sprintf("%.1f KB", float64(size)/float64(KB))
	default:
		return fmt.Sprintf("%d B", size)
	}
}
