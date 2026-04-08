import React from 'react';
import { Tag, Button, Space, Popover, Dropdown } from '@douyinfe/semi-ui';
import { IconMore } from '@douyinfe/semi-icons';
import { timestamp2string } from '../../../helpers';
import {
  INVITATION_CODE_STATUS,
  INVITATION_CODE_ACTIONS,
} from '../../../hooks/invitation_codes/useInvitationCodesData';

const STATUS_MAP = {
  [INVITATION_CODE_STATUS.ENABLED]: { color: 'green', text: '已启用' },
  [INVITATION_CODE_STATUS.DISABLED]: { color: 'red', text: '已禁用' },
};

const isExpired = (record) => {
  return (
    record.status === INVITATION_CODE_STATUS.ENABLED &&
    record.expired_at !== 0 &&
    record.expired_at < Math.floor(Date.now() / 1000)
  );
};

const renderStatus = (status, record, t) => {
  if (isExpired(record)) {
    return (
      <Tag color='orange' shape='circle'>
        {t('已过期')}
      </Tag>
    );
  }
  const statusConfig = STATUS_MAP[status];
  if (statusConfig) {
    return (
      <Tag color={statusConfig.color} shape='circle'>
        {t(statusConfig.text)}
      </Tag>
    );
  }
  return (
    <Tag color='black' shape='circle'>
      {t('未知状态')}
    </Tag>
  );
};

export const getInvitationCodesColumns = ({
  t,
  manageCode,
  copyText,
  setEditingCode,
  setShowEdit,
  showDeleteModal,
}) => {
  return [
    {
      title: t('ID'),
      dataIndex: 'id',
    },
    {
      title: t('名称'),
      dataIndex: 'name',
    },
    {
      title: t('状态'),
      dataIndex: 'status',
      key: 'status',
      render: (text, record) => {
        return <div>{renderStatus(text, record, t)}</div>;
      },
    },
    {
      title: t('创建时间'),
      dataIndex: 'created_at',
      render: (text) => {
        return <div>{text ? timestamp2string(text) : '-'}</div>;
      },
    },
    {
      title: t('过期时间'),
      dataIndex: 'expired_at',
      render: (text) => {
        return <div>{text === 0 ? t('永不过期') : timestamp2string(text)}</div>;
      },
    },
    {
      title: '',
      dataIndex: 'operate',
      fixed: 'right',
      width: 205,
      render: (text, record) => {
        const moreMenuItems = [
          {
            node: 'item',
            name: t('删除'),
            type: 'danger',
            onClick: () => {
              showDeleteModal(record);
            },
          },
        ];

        if (
          record.status === INVITATION_CODE_STATUS.ENABLED &&
          !isExpired(record)
        ) {
          moreMenuItems.push({
            node: 'item',
            name: t('禁用'),
            type: 'warning',
            onClick: () => {
              manageCode(
                record.id,
                INVITATION_CODE_ACTIONS.DISABLE,
                record,
              );
            },
          });
        } else if (!isExpired(record)) {
          moreMenuItems.push({
            node: 'item',
            name: t('启用'),
            type: 'secondary',
            onClick: () => {
              manageCode(record.id, INVITATION_CODE_ACTIONS.ENABLE, record);
            },
          });
        }

        return (
          <Space>
            <Popover
              content={record.code}
              style={{ padding: 20 }}
              position='top'
            >
              <Button type='tertiary' size='small'>
                {t('查看')}
              </Button>
            </Popover>
            <Button
              size='small'
              onClick={async () => {
                await copyText(record.code);
              }}
            >
              {t('复制')}
            </Button>
            <Button
              type='tertiary'
              size='small'
              onClick={() => {
                setEditingCode(record);
                setShowEdit(true);
              }}
            >
              {t('编辑')}
            </Button>
            <Dropdown
              trigger='click'
              position='bottomRight'
              menu={moreMenuItems}
            >
              <Button type='tertiary' size='small' icon={<IconMore />} />
            </Dropdown>
          </Space>
        );
      },
    },
  ];
};
