package model

import (
	"errors"
	"strconv"

	"github.com/QuantumNous/new-api/common"

	"gorm.io/gorm"
)

const (
	InvitationCodeStatusEnabled  = 1
	InvitationCodeStatusDisabled = 2
)

type InvitationCode struct {
	Id        int            `json:"id"`
	Code      string         `json:"code" gorm:"type:char(32);uniqueIndex"`
	Name      string         `json:"name" gorm:"index"`
	CreatedBy int            `json:"created_by" gorm:"index"`
	Status    int            `json:"status" gorm:"default:1"`
	ExpiredAt int64          `json:"expired_at" gorm:"bigint"`
	CreatedAt int64          `json:"created_at" gorm:"bigint"`
	UpdatedAt int64          `json:"updated_at" gorm:"bigint"`
	DeletedAt gorm.DeletedAt `gorm:"index"`
}

func GetAllInvitationCodes(startIdx int, num int) (codes []*InvitationCode, total int64, err error) {
	tx := DB.Begin()
	if tx.Error != nil {
		return nil, 0, tx.Error
	}
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	err = tx.Model(&InvitationCode{}).Count(&total).Error
	if err != nil {
		tx.Rollback()
		return nil, 0, err
	}

	err = tx.Order("id desc").Limit(num).Offset(startIdx).Find(&codes).Error
	if err != nil {
		tx.Rollback()
		return nil, 0, err
	}

	if err = tx.Commit().Error; err != nil {
		return nil, 0, err
	}
	return codes, total, nil
}

func SearchInvitationCodes(keyword string, startIdx int, num int) (codes []*InvitationCode, total int64, err error) {
	tx := DB.Begin()
	if tx.Error != nil {
		return nil, 0, tx.Error
	}
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	query := tx.Model(&InvitationCode{})
	if id, err := strconv.Atoi(keyword); err == nil {
		query = query.Where("id = ? OR name LIKE ?", id, keyword+"%")
	} else {
		query = query.Where("name LIKE ?", keyword+"%")
	}

	err = query.Count(&total).Error
	if err != nil {
		tx.Rollback()
		return nil, 0, err
	}

	err = query.Order("id desc").Limit(num).Offset(startIdx).Find(&codes).Error
	if err != nil {
		tx.Rollback()
		return nil, 0, err
	}

	if err = tx.Commit().Error; err != nil {
		return nil, 0, err
	}
	return codes, total, nil
}

func GetInvitationCodeById(id int) (*InvitationCode, error) {
	if id == 0 {
		return nil, errors.New("id 为空")
	}
	ic := InvitationCode{Id: id}
	err := DB.First(&ic, "id = ?", id).Error
	return &ic, err
}

func GetInvitationCodeByCode(code string) (*InvitationCode, error) {
	if code == "" {
		return nil, errors.New("邀请码为空")
	}
	ic := &InvitationCode{}
	err := DB.Where("code = ?", code).First(ic).Error
	if err != nil {
		return nil, errors.New("无效的邀请码")
	}
	return ic, nil
}

func ValidateInvitationCode(code string) error {
	ic, err := GetInvitationCodeByCode(code)
	if err != nil {
		return err
	}
	if ic.Status != InvitationCodeStatusEnabled {
		return errors.New("该邀请码已被禁用")
	}
	if ic.ExpiredAt != 0 && ic.ExpiredAt < common.GetTimestamp() {
		return errors.New("该邀请码已过期")
	}
	return nil
}

func (ic *InvitationCode) Insert() error {
	return DB.Create(ic).Error
}

func (ic *InvitationCode) Update() error {
	return DB.Model(ic).Select("name", "status", "expired_at").Updates(ic).Error
}

func (ic *InvitationCode) Delete() error {
	return DB.Delete(ic).Error
}

func DeleteInvitationCodeById(id int) error {
	if id == 0 {
		return errors.New("id 为空")
	}
	ic := InvitationCode{Id: id}
	err := DB.Where(ic).First(&ic).Error
	if err != nil {
		return err
	}
	return ic.Delete()
}
