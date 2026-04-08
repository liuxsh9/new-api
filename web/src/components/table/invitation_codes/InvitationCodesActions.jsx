import React from 'react';
import { Button } from '@douyinfe/semi-ui';

const InvitationCodesActions = ({
  selectedKeys,
  setEditingCode,
  setShowEdit,
  batchCopyCodes,
  t,
}) => {
  const handleAdd = () => {
    setEditingCode({ id: undefined });
    setShowEdit(true);
  };

  return (
    <div className='flex flex-wrap gap-2 w-full md:w-auto order-2 md:order-1'>
      <Button
        type='primary'
        className='flex-1 md:flex-initial'
        onClick={handleAdd}
        size='small'
      >
        {t('添加邀请码')}
      </Button>

      <Button
        type='tertiary'
        className='flex-1 md:flex-initial'
        onClick={batchCopyCodes}
        size='small'
      >
        {t('复制所选邀请码到剪贴板')}
      </Button>
    </div>
  );
};

export default InvitationCodesActions;
