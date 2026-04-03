import React, { useEffect, useState, useMemo } from 'react';
import { Table, DatePicker, Button, Space, Typography } from '@douyinfe/semi-ui';
import { IconRefresh, IconDownload } from '@douyinfe/semi-icons';
import { useTranslation } from 'react-i18next';
import { renderQuota, showError } from '../../../helpers';
import { useMonthlyStats } from '../../../hooks/usage-logs/useMonthlyStats';
import { API } from '../../../helpers/api';

const { Text } = Typography;

const MonthlyStatsTable = () => {
  const { t } = useTranslation();
  const { monthlyStats, channelStats, loading, fetchMonthlyStats } = useMonthlyStats();

  // null means show all months; a Date means filter to that month
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [exporting, setExporting] = useState(false);

  const loadData = () => {
    const now = new Date();
    // Always fetch last 12 months of data
    const start = Math.floor(new Date(now.getFullYear() - 1, now.getMonth(), 1).getTime() / 1000);
    const end = Math.floor(now.getTime() / 1000);
    fetchMonthlyStats(start, end);
  };

  // Compute month range from selectedMonth
  const getMonthRange = (monthDate) => {
    if (!monthDate) return null;
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const start = Math.floor(new Date(year, month, 1).getTime() / 1000);
    const end = Math.floor(new Date(year, month + 1, 0, 23, 59, 59).getTime() / 1000);
    return { start, end };
  };

  const handleExport = async () => {
    if (!selectedMonth) {
      showError(t('请先选择一个月份再导出'));
      return;
    }
    const range = getMonthRange(selectedMonth);
    setExporting(true);
    try {
      const res = await API.get('/api/log/export/user_quota', {
        params: { start_timestamp: range.start, end_timestamp: range.end },
        responseType: 'blob',
        skipErrorHandler: true,
      });
      const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const ym = `${selectedMonth.getFullYear()}-${String(selectedMonth.getMonth() + 1).padStart(2, '0')}`;
      link.download = `user_quota_${ym}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      showError(err.message || t('导出失败'));
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const formatNumber = (num) => {
    if (num == null) return '0';
    return Number(num).toLocaleString();
  };

  // Filter displayed data by selectedMonth
  const displayStats = useMemo(() => {
    if (!selectedMonth) return monthlyStats;
    const ym = `${selectedMonth.getFullYear()}-${String(selectedMonth.getMonth() + 1).padStart(2, '0')}`;
    return monthlyStats.filter((row) => row.month === ym);
  }, [monthlyStats, selectedMonth]);

  const displayChannelStats = useMemo(() => {
    if (!selectedMonth) return channelStats;
    const ym = `${selectedMonth.getFullYear()}-${String(selectedMonth.getMonth() + 1).padStart(2, '0')}`;
    return channelStats.filter((row) => row.month === ym);
  }, [channelStats, selectedMonth]);

  // Build a map: month -> channel breakdown rows
  const channelStatsByMonth = useMemo(() => {
    const map = {};
    for (const row of displayChannelStats) {
      if (!map[row.month]) map[row.month] = [];
      map[row.month].push(row);
    }
    return map;
  }, [displayChannelStats]);

  const channelColumns = [
    {
      title: t('渠道'),
      dataIndex: 'channel_name',
      key: 'channel_name',
      render: (text, record) => text || `${t('渠道')} #${record.channel_id}`,
    },
    {
      title: t('请求次数'),
      dataIndex: 'request_count',
      key: 'request_count',
      render: (text) => formatNumber(text),
    },
    {
      title: t('输入Tokens'),
      dataIndex: 'prompt_tokens',
      key: 'prompt_tokens',
      render: (text) => formatNumber(text),
    },
    {
      title: t('输出Tokens'),
      dataIndex: 'completion_tokens',
      key: 'completion_tokens',
      render: (text) => formatNumber(text),
    },
    {
      title: t('消耗额度'),
      dataIndex: 'quota',
      key: 'quota',
      render: (text) => renderQuota(text, 6),
    },
  ];

  const mainColumns = [
    {
      title: t('月份'),
      dataIndex: 'month',
      key: 'month',
    },
    {
      title: t('请求次数'),
      dataIndex: 'request_count',
      key: 'request_count',
      render: (text) => formatNumber(text),
    },
    {
      title: t('输入Tokens'),
      dataIndex: 'prompt_tokens',
      key: 'prompt_tokens',
      render: (text) => formatNumber(text),
    },
    {
      title: t('输出Tokens'),
      dataIndex: 'completion_tokens',
      key: 'completion_tokens',
      render: (text) => formatNumber(text),
    },
    {
      title: t('消耗额度'),
      dataIndex: 'quota',
      key: 'quota',
      render: (text) => renderQuota(text, 6),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Space>
          <DatePicker
            type="month"
            value={selectedMonth}
            onChange={(value) => setSelectedMonth(value || null)}
            placeholder={t('全部月份')}
            style={{ width: 160 }}
            clearText={t('全部月份')}
            showClear
          />
          <Button
            icon={<IconRefresh />}
            onClick={loadData}
            loading={loading}
          >
            {t('查询')}
          </Button>
          <Button
            icon={<IconDownload />}
            onClick={handleExport}
            loading={exporting}
            theme="solid"
            disabled={!selectedMonth}
          >
            {t('导出用户额度')}
          </Button>
          {!selectedMonth && (
            <Text type="tertiary" size="small">
              {t('选择月份后可导出该月数据')}
            </Text>
          )}
        </Space>
      </div>
      <Table
        columns={mainColumns}
        dataSource={displayStats}
        rowKey="month"
        loading={loading}
        pagination={false}
        size="small"
        expandedRowRender={(record) => {
          const channels = channelStatsByMonth[record.month] || [];
          if (channels.length === 0) return null;
          return (
            <Table
              columns={channelColumns}
              dataSource={channels}
              rowKey={(r) => `${r.channel_id}`}
              pagination={false}
              size="small"
              style={{ margin: '8px 0' }}
            />
          );
        }}
      />
    </div>
  );
};

export default MonthlyStatsTable;
