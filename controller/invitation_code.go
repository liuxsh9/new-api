package controller

import (
	"net/http"
	"strconv"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
)

func GetAllInvitationCodes(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	codes, total, err := model.GetAllInvitationCodes(pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(codes)
	common.ApiSuccess(c, pageInfo)
}

func SearchInvitationCodes(c *gin.Context) {
	keyword := c.Query("keyword")
	pageInfo := common.GetPageQuery(c)
	codes, total, err := model.SearchInvitationCodes(keyword, pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(codes)
	common.ApiSuccess(c, pageInfo)
}

func GetInvitationCode(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	code, err := model.GetInvitationCodeById(id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    code,
	})
}

func AddInvitationCode(c *gin.Context) {
	type addRequest struct {
		Name      string `json:"name"`
		Count     int    `json:"count"`
		ExpiredAt int64  `json:"expired_at"`
	}
	var req addRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, err)
		return
	}
	if utf8.RuneCountInString(req.Name) == 0 || utf8.RuneCountInString(req.Name) > 20 {
		common.ApiErrorI18n(c, i18n.MsgInvitationCodeNameLength)
		return
	}
	if req.Count <= 0 {
		req.Count = 1
	}
	if req.Count > 100 {
		req.Count = 100
	}
	if req.ExpiredAt != 0 && req.ExpiredAt < common.GetTimestamp() {
		common.ApiErrorI18n(c, i18n.MsgInvitationCodeExpireInvalid)
		return
	}

	var keys []string
	now := common.GetTimestamp()
	for i := 0; i < req.Count; i++ {
		code := common.GetUUID()
		ic := model.InvitationCode{
			Code:      code,
			Name:      req.Name,
			CreatedBy: c.GetInt("id"),
			Status:    model.InvitationCodeStatusEnabled,
			ExpiredAt: req.ExpiredAt,
			CreatedAt: now,
			UpdatedAt: now,
		}
		if err := ic.Insert(); err != nil {
			common.SysError("failed to insert invitation code: " + err.Error())
			c.JSON(http.StatusOK, gin.H{
				"success": false,
				"message": i18n.T(c, i18n.MsgInvitationCodeCreateFailed),
				"data":    keys,
			})
			return
		}
		keys = append(keys, code)
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    keys,
	})
}

func UpdateInvitationCode(c *gin.Context) {
	statusOnly := c.Query("status_only")
	var ic model.InvitationCode
	if err := c.ShouldBindJSON(&ic); err != nil {
		common.ApiError(c, err)
		return
	}
	cleanCode, err := model.GetInvitationCodeById(ic.Id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if statusOnly == "" {
		if ic.ExpiredAt != 0 && ic.ExpiredAt < common.GetTimestamp() {
			common.ApiErrorI18n(c, i18n.MsgInvitationCodeExpireInvalid)
			return
		}
		cleanCode.Name = ic.Name
		cleanCode.ExpiredAt = ic.ExpiredAt
	}
	if statusOnly != "" {
		cleanCode.Status = ic.Status
	}
	if err := cleanCode.Update(); err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    cleanCode,
	})
}

func DeleteInvitationCode(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	if err := model.DeleteInvitationCodeById(id); err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
	})
}
