import React, { useEffect, useState, useMemo } from 'react';
import {
  Table,
  Select,
  Button,
  Space,
  Typography,
  Banner,
  Tag,
  Checkbox,
} from '@douyinfe/semi-ui';
import {
  IconDownload,
  IconRefresh,
  IconInfoCircle,
  IconCode,
} from '@douyinfe/semi-icons';
import { useTranslation } from 'react-i18next';
import { API, showError } from '../../../helpers';

const { Text, Paragraph } = Typography;

const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + units[i];
};

const LogArchiveTable = () => {
  const { t } = useTranslation();
  const [files, setFiles] = useState([]);
  const [months, setMonths] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState(undefined);
  const [loading, setLoading] = useState(false);
  const [selectedPaths, setSelectedPaths] = useState(new Set());
  const [downloadingPaths, setDownloadingPaths] = useState(new Set());

  const fetchArchives = async (month) => {
    setLoading(true);
    try {
      const params = month ? `?month=${month}` : '';
      const res = await API.get(`/api/log/archives${params}`);
      if (res.data.success) {
        setFiles(res.data.data.files || []);
        setMonths(res.data.data.months || []);
      } else {
        showError(res.data.message);
      }
    } catch (err) {
      showError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchArchives(selectedMonth);
  }, []);

  const handleMonthChange = (value) => {
    setSelectedMonth(value || undefined);
    setSelectedPaths(new Set());
    fetchArchives(value || undefined);
  };

  const handleDownload = (path) => {
    setDownloadingPaths((prev) => new Set([...prev, path]));
    const link = document.createElement('a');
    link.href = `/api/log/archives/download?path=${encodeURIComponent(path)}`;
    link.download = '';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => {
      setDownloadingPaths((prev) => {
        const next = new Set(prev);
        next.delete(path);
        return next;
      });
    }, 2000);
  };

  const handleBatchDownload = () => {
    const paths = Array.from(selectedPaths);
    paths.forEach((path, index) => {
      setTimeout(() => handleDownload(path), index * 500);
    });
  };

  // Generate a shell script with wget -c commands for selected (or all) files
  const handleGenerateScript = async () => {
    const targetFiles =
      selectedPaths.size > 0
        ? files.filter((f) => selectedPaths.has(f.path))
        : files;

    if (targetFiles.length === 0) return;

    // Request a temporary download token (valid 24h)
    let token = '';
    try {
      const res = await API.post('/api/log/archives/token');
      if (res.data.success) {
        token = res.data.data.token;
      } else {
        showError(res.data.message || t('生成下载令牌失败'));
        return;
      }
    } catch (err) {
      showError(err.message || t('生成下载令牌失败'));
      return;
    }

    const baseUrl = window.location.origin;
    const monthLabel = selectedMonth || 'all';
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toLocaleString();
    const lines = [
      '#!/bin/bash',
      `# ${t('日志归档批量下载脚本')}`,
      `# ${t('生成时间')}: ${new Date().toLocaleString()}`,
      `# ${t('令牌有效期')}: ${expiresAt} (24h)`,
      `# ${t('文件数')}: ${targetFiles.length}, ${t('总计')}: ${formatFileSize(targetFiles.reduce((s, f) => s + f.size, 0))}`,
      '#',
      `# ${t('使用方法')}:`,
      `#   chmod +x download-logs-${monthLabel}.sh`,
      `#   ./download-logs-${monthLabel}.sh`,
      '#',
      `# ${t('支持断点续传：中断后重新运行即可从断点继续')}`,
      `# ${t('令牌过期后需重新生成脚本')}`,
      '',
      'set -e',
      '',
      `TOKEN="${token}"`,
      '',
    ];

    // Group files by month subfolder
    const byMonth = {};
    for (const f of targetFiles) {
      const dir = f.path.includes('/') ? f.path.split('/')[0] : '.';
      if (!byMonth[dir]) byMonth[dir] = [];
      byMonth[dir].push(f);
    }

    for (const [dir, dirFiles] of Object.entries(byMonth)) {
      lines.push(`mkdir -p "${dir}"`);
      for (const f of dirFiles) {
        const url = `${baseUrl}/api/log/archives/download_t?path=${encodeURIComponent(f.path)}&token=\${TOKEN}`;
        const outFile = dir === '.' ? f.name : `${dir}/${f.name}`;
        lines.push(
          `echo "[${formatFileSize(f.size)}] ${t('下载')} ${f.name} ..."`,
        );
        lines.push(`wget -c --show-progress -O "${outFile}" "${url}"`);
      }
      lines.push('');
    }

    lines.push(`echo ""`);
    lines.push(`echo "${t('全部下载完成！')}"`);

    const script = lines.join('\n');
    const blob = new Blob([script], { type: 'text/x-shellscript;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `download-logs-${monthLabel}.sh`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const toggleSelect = (path) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedPaths.size === files.length) {
      setSelectedPaths(new Set());
    } else {
      setSelectedPaths(new Set(files.map((f) => f.path)));
    }
  };

  const totalSize = useMemo(
    () => files.reduce((sum, f) => sum + f.size, 0),
    [files],
  );
  const selectedSize = useMemo(
    () =>
      files
        .filter((f) => selectedPaths.has(f.path))
        .reduce((sum, f) => sum + f.size, 0),
    [files, selectedPaths],
  );

  const columns = [
    {
      title: (
        <Checkbox
          checked={files.length > 0 && selectedPaths.size === files.length}
          indeterminate={
            selectedPaths.size > 0 && selectedPaths.size < files.length
          }
          onChange={toggleSelectAll}
        />
      ),
      dataIndex: 'select',
      key: 'select',
      width: 50,
      render: (_, record) => (
        <Checkbox
          checked={selectedPaths.has(record.path)}
          onChange={() => toggleSelect(record.path)}
        />
      ),
    },
    {
      title: t('日期'),
      dataIndex: 'date',
      key: 'date',
      width: 130,
      render: (text) => <Text strong>{text}</Text>,
    },
    {
      title: t('文件名'),
      dataIndex: 'name',
      key: 'name',
      render: (text) => <Text copyable>{text}</Text>,
    },
    {
      title: t('大小'),
      dataIndex: 'size',
      key: 'size',
      width: 120,
      render: (size) => {
        const sizeGB = size / (1024 * 1024 * 1024);
        return (
          <Space>
            <Text>{formatFileSize(size)}</Text>
            {sizeGB > 1 && (
              <Tag color="orange" size="small">
                {t('大文件')}
              </Tag>
            )}
          </Space>
        );
      },
      sorter: (a, b) => a.size - b.size,
    },
    {
      title: t('操作'),
      key: 'action',
      width: 120,
      render: (_, record) => (
        <Button
          icon={<IconDownload />}
          size="small"
          loading={downloadingPaths.has(record.path)}
          onClick={() => handleDownload(record.path)}
        >
          {t('下载')}
        </Button>
      ),
    },
  ];

  return (
    <div>
      <Banner
        type="info"
        icon={<IconInfoCircle />}
        closeIcon={null}
        style={{ marginBottom: 16 }}
        description={
          <div>
            <Paragraph style={{ margin: 0 }}>
              <Text strong>{t('日志归档说明')}</Text>
              {t(
                '：每日 7:00 自动将前一天的详细日志压缩归档（xz 格式）。',
              )}
              {t(
                '小文件可直接点击下载；大文件或批量下载建议点击「生成下载脚本」，在本地终端执行脚本，支持断点续传。',
              )}
            </Paragraph>
            <Paragraph
              style={{
                margin: '8px 0 0',
                padding: '8px 12px',
                background: 'var(--semi-color-fill-0)',
                borderRadius: 6,
                fontFamily: 'monospace',
                fontSize: 13,
                lineHeight: '20px',
              }}
            >
              <Text style={{ color: 'var(--semi-color-text-2)' }}>
                # {t('使用方式：1. 筛选月份或勾选文件 → 2. 点击「生成下载脚本」→ 3. 在终端执行：')}
              </Text>
              <br />
              <Text copyable>
                {`chmod +x download-logs-*.sh && ./download-logs-*.sh`}
              </Text>
              <br />
              <br />
              <Text style={{ color: 'var(--semi-color-text-2)' }}>
                # {t('也可手动下载单个文件（-c 支持断点续传，TOKEN 从生成的脚本中获取）：')}
              </Text>
              <br />
              <Text copyable>
                {`wget -c "${window.location.origin}/api/log/archives/download_t?path=2026-04/detail-2026-04-01.log.xz&token=TOKEN"`}
              </Text>
            </Paragraph>
          </div>
        }
      />

      <div style={{ marginBottom: 16 }}>
        <Space wrap>
          <Select
            value={selectedMonth}
            onChange={handleMonthChange}
            placeholder={t('全部月份')}
            style={{ width: 160 }}
            showClear
          >
            {months.map((m) => (
              <Select.Option key={m} value={m}>
                {m}
              </Select.Option>
            ))}
          </Select>
          <Button icon={<IconRefresh />} onClick={() => fetchArchives(selectedMonth)} loading={loading}>
            {t('刷新')}
          </Button>
          <Button
            icon={<IconCode />}
            onClick={handleGenerateScript}
            disabled={files.length === 0}
          >
            {selectedPaths.size > 0
              ? `${t('生成下载脚本')} (${selectedPaths.size}${t('个')}, ${formatFileSize(selectedSize)})`
              : `${t('生成下载脚本')} (${t('全部')} ${formatFileSize(totalSize)})`}
          </Button>
          {selectedPaths.size > 0 && (
            <Button
              icon={<IconDownload />}
              theme="solid"
              onClick={handleBatchDownload}
            >
              {t('浏览器直接下载')} ({selectedPaths.size}{t('个')})
            </Button>
          )}
          <Text type="tertiary" size="small">
            {t('共')} {files.length} {t('个文件')}
            {totalSize > 0 && `，${t('总计')} ${formatFileSize(totalSize)}`}
          </Text>
        </Space>
      </div>

      <Table
        columns={columns}
        dataSource={files}
        rowKey="path"
        loading={loading}
        pagination={files.length > 50 ? { pageSize: 50 } : false}
        size="small"
      />
    </div>
  );
};

export default LogArchiveTable;
