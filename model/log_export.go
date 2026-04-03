package model

import (
	"encoding/csv"
	"fmt"
	"io"

	"github.com/QuantumNous/new-api/common"
)

func ExportUserQuotaToCSV(w io.Writer, stats []UserQuotaUsageStat) error {
	writer := csv.NewWriter(w)
	defer writer.Flush()

	if err := writer.Write([]string{"User ID", "Username", "Display Name", "Remark", "Requests", "Prompt Tokens", "Completion Tokens", "Quota", "Amount"}); err != nil {
		return err
	}

	for _, stat := range stats {
		amount := float64(stat.Quota) / float64(common.QuotaPerUnit)
		displayName := stat.DisplayName
		if displayName == "" {
			displayName = stat.Username
		}
		if err := writer.Write([]string{
			fmt.Sprintf("%d", stat.UserId),
			stat.Username,
			displayName,
			stat.Remark,
			fmt.Sprintf("%d", stat.RequestCount),
			fmt.Sprintf("%d", stat.PromptTokens),
			fmt.Sprintf("%d", stat.CompletionTokens),
			fmt.Sprintf("%d", stat.Quota),
			fmt.Sprintf("%.2f", amount),
		}); err != nil {
			return err
		}
	}

	return nil
}
