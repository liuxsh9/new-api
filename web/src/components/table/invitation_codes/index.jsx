import React from 'react';
import CardPro from '../../common/ui/CardPro';
import InvitationCodesTable from './InvitationCodesTable';
import InvitationCodesActions from './InvitationCodesActions';
import InvitationCodesFilters from './InvitationCodesFilters';
import InvitationCodesDescription from './InvitationCodesDescription';
import EditInvitationCodeModal from './modals/EditInvitationCodeModal';
import { useInvitationCodesData } from '../../../hooks/invitation_codes/useInvitationCodesData';
import { useIsMobile } from '../../../hooks/common/useIsMobile';
import { createCardProPagination } from '../../../helpers/utils';

const InvitationCodesPage = () => {
  const data = useInvitationCodesData();
  const isMobile = useIsMobile();

  const {
    showEdit,
    editingCode,
    closeEdit,
    refresh,
    selectedKeys,
    setEditingCode,
    setShowEdit,
    batchCopyCodes,
    formInitValues,
    setFormApi,
    searchCodes,
    loading,
    searching,
    compactMode,
    setCompactMode,
    t,
  } = data;

  return (
    <>
      <EditInvitationCodeModal
        refresh={refresh}
        editingCode={editingCode}
        visiable={showEdit}
        handleClose={closeEdit}
      />

      <CardPro
        type='type1'
        descriptionArea={
          <InvitationCodesDescription
            compactMode={compactMode}
            setCompactMode={setCompactMode}
            t={t}
          />
        }
        actionsArea={
          <div className='flex flex-col md:flex-row justify-between items-center gap-2 w-full'>
            <InvitationCodesActions
              selectedKeys={selectedKeys}
              setEditingCode={setEditingCode}
              setShowEdit={setShowEdit}
              batchCopyCodes={batchCopyCodes}
              t={t}
            />

            <div className='w-full md:w-full lg:w-auto order-1 md:order-2'>
              <InvitationCodesFilters
                formInitValues={formInitValues}
                setFormApi={setFormApi}
                searchCodes={searchCodes}
                loading={loading}
                searching={searching}
                t={t}
              />
            </div>
          </div>
        }
        paginationArea={createCardProPagination({
          currentPage: data.activePage,
          pageSize: data.pageSize,
          total: data.tokenCount,
          onPageChange: data.handlePageChange,
          onPageSizeChange: data.handlePageSizeChange,
          isMobile: isMobile,
          t: data.t,
        })}
        t={data.t}
      >
        <InvitationCodesTable {...data} />
      </CardPro>
    </>
  );
};

export default InvitationCodesPage;
