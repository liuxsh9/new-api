import { useState, useEffect } from 'react';
import { API, showError, showSuccess, copy } from '../../helpers';
import { ITEMS_PER_PAGE } from '../../constants';
import { Modal } from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';
import { useTableCompactMode } from '../common/useTableCompactMode';

const INVITATION_CODE_STATUS = {
  ENABLED: 1,
  DISABLED: 2,
};

const INVITATION_CODE_ACTIONS = {
  DELETE: 'delete',
  ENABLE: 'enable',
  DISABLE: 'disable',
};

export { INVITATION_CODE_STATUS, INVITATION_CODE_ACTIONS };

export const useInvitationCodesData = () => {
  const { t } = useTranslation();

  // Basic state
  const [codes, setCodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [activePage, setActivePage] = useState(1);
  const [pageSize, setPageSize] = useState(ITEMS_PER_PAGE);
  const [tokenCount, setTokenCount] = useState(0);
  const [selectedKeys, setSelectedKeys] = useState([]);

  // Edit state
  const [editingCode, setEditingCode] = useState({ id: undefined });
  const [showEdit, setShowEdit] = useState(false);

  // Form API
  const [formApi, setFormApi] = useState(null);

  // UI state
  const [compactMode, setCompactMode] = useTableCompactMode('invitation_codes');

  // Form state
  const formInitValues = {
    searchKeyword: '',
  };

  const getFormValues = () => {
    const formValues = formApi ? formApi.getValues() : {};
    return {
      searchKeyword: formValues.searchKeyword || '',
    };
  };

  const loadCodes = async (page = 1, ps) => {
    setLoading(true);
    try {
      const res = await API.get(
        `/api/user/invitation_code/?p=${page}&page_size=${ps}`,
      );
      const { success, message, data } = res.data;
      if (success) {
        setActivePage(data.page <= 0 ? 1 : data.page);
        setTokenCount(data.total);
        setCodes(data.items);
      } else {
        showError(message);
      }
    } catch (error) {
      showError(error.message);
    }
    setLoading(false);
  };

  const searchCodes = async () => {
    const { searchKeyword } = getFormValues();
    if (searchKeyword === '') {
      await loadCodes(1, pageSize);
      return;
    }

    setSearching(true);
    try {
      const res = await API.get(
        `/api/user/invitation_code/search?keyword=${searchKeyword}&p=1&page_size=${pageSize}`,
      );
      const { success, message, data } = res.data;
      if (success) {
        setActivePage(data.page || 1);
        setTokenCount(data.total);
        setCodes(data.items);
      } else {
        showError(message);
      }
    } catch (error) {
      showError(error.message);
    }
    setSearching(false);
  };

  const manageCode = async (id, action, record) => {
    setLoading(true);
    let data = { id };
    let res;

    try {
      switch (action) {
        case INVITATION_CODE_ACTIONS.DELETE:
          res = await API.delete(`/api/user/invitation_code/${id}`);
          break;
        case INVITATION_CODE_ACTIONS.ENABLE:
          data.status = INVITATION_CODE_STATUS.ENABLED;
          res = await API.put(
            '/api/user/invitation_code/?status_only=true',
            data,
          );
          break;
        case INVITATION_CODE_ACTIONS.DISABLE:
          data.status = INVITATION_CODE_STATUS.DISABLED;
          res = await API.put(
            '/api/user/invitation_code/?status_only=true',
            data,
          );
          break;
        default:
          throw new Error('Unknown operation type');
      }

      const { success, message } = res.data;
      if (success) {
        showSuccess(t('操作成功完成！'));
        if (action !== INVITATION_CODE_ACTIONS.DELETE) {
          const updated = res.data.data;
          record.status = updated.status;
          setCodes([...codes]);
        }
      } else {
        showError(message);
      }
    } catch (error) {
      showError(error.message);
    }
    setLoading(false);
  };

  const refresh = async (page = activePage) => {
    const { searchKeyword } = getFormValues();
    if (searchKeyword === '') {
      await loadCodes(page, pageSize);
    } else {
      await searchCodes();
    }
  };

  const handlePageChange = (page) => {
    setActivePage(page);
    const { searchKeyword } = getFormValues();
    if (searchKeyword === '') {
      loadCodes(page, pageSize);
    } else {
      searchCodes();
    }
  };

  const handlePageSizeChange = (size) => {
    setPageSize(size);
    setActivePage(1);
    const { searchKeyword } = getFormValues();
    if (searchKeyword === '') {
      loadCodes(1, size);
    } else {
      searchCodes();
    }
  };

  const rowSelection = {
    onSelect: (record, selected) => {},
    onSelectAll: (selected, selectedRows) => {},
    onChange: (selectedRowKeys, selectedRows) => {
      setSelectedKeys(selectedRows);
    },
  };

  const handleRow = (record, index) => {
    const isExpired =
      record.status === INVITATION_CODE_STATUS.ENABLED &&
      record.expired_at !== 0 &&
      record.expired_at < Math.floor(Date.now() / 1000);
    if (record.status !== INVITATION_CODE_STATUS.ENABLED || isExpired) {
      return {
        style: { background: 'var(--semi-color-disabled-border)' },
      };
    }
    return {};
  };

  const copyText = async (text) => {
    if (await copy(text)) {
      showSuccess(t('已复制到剪贴板！'));
    } else {
      Modal.error({
        title: t('无法复制到剪贴板，请手动复制'),
        content: text,
        size: 'large',
      });
    }
  };

  const batchCopyCodes = async () => {
    if (selectedKeys.length === 0) {
      showError(t('请至少选择一个邀请码！'));
      return;
    }
    let text = '';
    for (let i = 0; i < selectedKeys.length; i++) {
      text += selectedKeys[i].name + '    ' + selectedKeys[i].code + '\n';
    }
    await copyText(text);
  };

  const closeEdit = () => {
    setShowEdit(false);
    setTimeout(() => {
      setEditingCode({ id: undefined });
    }, 500);
  };

  useEffect(() => {
    loadCodes(1, pageSize).catch((reason) => {
      showError(reason);
    });
  }, [pageSize]);

  return {
    codes,
    loading,
    searching,
    activePage,
    pageSize,
    tokenCount,
    selectedKeys,
    editingCode,
    showEdit,
    formApi,
    formInitValues,
    compactMode,
    setCompactMode,
    loadCodes,
    searchCodes,
    manageCode,
    refresh,
    copyText,
    setActivePage,
    setPageSize,
    setSelectedKeys,
    setEditingCode,
    setShowEdit,
    setFormApi,
    setLoading,
    handlePageChange,
    handlePageSizeChange,
    rowSelection,
    handleRow,
    closeEdit,
    getFormValues,
    batchCopyCodes,
    t,
  };
};
