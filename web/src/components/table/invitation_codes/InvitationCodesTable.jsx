import React, { useMemo, useState } from 'react';
import { Empty, Modal } from '@douyinfe/semi-ui';
import CardTable from '../../common/ui/CardTable';
import {
  IllustrationNoResult,
  IllustrationNoResultDark,
} from '@douyinfe/semi-illustrations';
import { getInvitationCodesColumns } from './InvitationCodesColumnDefs';
import {
  INVITATION_CODE_STATUS,
  INVITATION_CODE_ACTIONS,
} from '../../../hooks/invitation_codes/useInvitationCodesData';

const InvitationCodesTable = (data) => {
  const {
    codes,
    loading,
    activePage,
    pageSize,
    tokenCount,
    compactMode,
    handlePageChange,
    rowSelection,
    handleRow,
    manageCode,
    copyText,
    setEditingCode,
    setShowEdit,
    refresh,
    t,
  } = data;

  const [showDelete, setShowDelete] = useState(false);
  const [deletingRecord, setDeletingRecord] = useState(null);

  const showDeleteModal = (record) => {
    setDeletingRecord(record);
    setShowDelete(true);
  };

  const handleDelete = async () => {
    if (!deletingRecord) return;
    await manageCode(deletingRecord.id, INVITATION_CODE_ACTIONS.DELETE, deletingRecord);
    setShowDelete(false);
    setDeletingRecord(null);
    refresh();
  };

  const columns = useMemo(() => {
    return getInvitationCodesColumns({
      t,
      manageCode,
      copyText,
      setEditingCode,
      setShowEdit,
      showDeleteModal,
    });
  }, [t, manageCode, copyText, setEditingCode, setShowEdit, showDeleteModal]);

  const tableColumns = useMemo(() => {
    return compactMode
      ? columns.map((col) => {
          if (col.dataIndex === 'operate') {
            const { fixed, ...rest } = col;
            return rest;
          }
          return col;
        })
      : columns;
  }, [compactMode, columns]);

  return (
    <>
      <CardTable
        columns={tableColumns}
        dataSource={codes}
        scroll={compactMode ? undefined : { x: 'max-content' }}
        pagination={{
          currentPage: activePage,
          pageSize: pageSize,
          total: tokenCount,
          showSizeChanger: true,
          pageSizeOptions: [10, 20, 50, 100],
          onPageSizeChange: data.handlePageSizeChange,
          onPageChange: handlePageChange,
        }}
        hidePagination={true}
        loading={loading}
        rowSelection={rowSelection}
        onRow={handleRow}
        empty={
          <Empty
            image={<IllustrationNoResult style={{ width: 150, height: 150 }} />}
            darkModeImage={
              <IllustrationNoResultDark style={{ width: 150, height: 150 }} />
            }
            description={t('搜索无结果')}
            style={{ padding: 30 }}
          />
        }
        className='rounded-xl overflow-hidden'
        size='middle'
      />

      <Modal
        title={t('删除邀请码')}
        visible={showDelete}
        onOk={handleDelete}
        onCancel={() => setShowDelete(false)}
        okText={t('删除')}
        cancelText={t('取消')}
        okButtonProps={{ type: 'danger' }}
      >
        <p>{t('确定要删除该邀请码吗？此操作不可撤销。')}</p>
      </Modal>
    </>
  );
};

export default InvitationCodesTable;
