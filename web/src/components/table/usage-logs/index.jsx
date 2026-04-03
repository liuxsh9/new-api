/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

import React, { useState } from 'react';
import { Tabs, TabPane } from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';
import CardPro from '../../common/ui/CardPro';
import LogsTable from './UsageLogsTable';
import LogsActions from './UsageLogsActions';
import LogsFilters from './UsageLogsFilters';
import ColumnSelectorModal from './modals/ColumnSelectorModal';
import UserInfoModal from './modals/UserInfoModal';
import ChannelAffinityUsageCacheModal from './modals/ChannelAffinityUsageCacheModal';
import ParamOverrideModal from './modals/ParamOverrideModal';
import LogDetailModal from './modals/LogDetailModal';
import MonthlyStatsTable from './MonthlyStatsTable';
import { useLogsData } from '../../../hooks/usage-logs/useUsageLogsData';
import { useIsMobile } from '../../../hooks/common/useIsMobile';
import { isAdmin } from '../../../helpers';
import { createCardProPagination } from '../../../helpers/utils';

const LogsPage = () => {
  const { t } = useTranslation();
  const logsData = useLogsData();
  const isMobile = useIsMobile();
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [selectedRequestId, setSelectedRequestId] = useState(null);
  const showTabs = isAdmin();

  // Expose function to global scope for column button to call
  React.useEffect(() => {
    window.showLogDetail = (requestId) => {
      setSelectedRequestId(requestId);
      setDetailModalVisible(true);
    };
    return () => {
      delete window.showLogDetail;
    };
  }, []);

  const logsContent = (
    <>
      {/* Modals */}
      <ColumnSelectorModal {...logsData} />
      <UserInfoModal {...logsData} />
      <ChannelAffinityUsageCacheModal {...logsData} />
      <ParamOverrideModal {...logsData} />
      <LogDetailModal
        visible={detailModalVisible}
        onClose={() => setDetailModalVisible(false)}
        requestId={selectedRequestId}
        t={logsData.t}
      />

      {/* Main Content */}
      <CardPro
        type='type2'
        statsArea={<LogsActions {...logsData} />}
        searchArea={<LogsFilters {...logsData} />}
        paginationArea={createCardProPagination({
          currentPage: logsData.activePage,
          pageSize: logsData.pageSize,
          total: logsData.logCount,
          onPageChange: logsData.handlePageChange,
          onPageSizeChange: logsData.handlePageSizeChange,
          isMobile: isMobile,
          t: logsData.t,
        })}
        t={logsData.t}
      >
        <LogsTable {...logsData} />
      </CardPro>
    </>
  );

  if (!showTabs) {
    return logsContent;
  }

  return (
    <Tabs type="line">
      <TabPane tab={t('使用明细')} itemKey="detail">
        {logsContent}
      </TabPane>
      <TabPane tab={t('月度统计')} itemKey="monthly">
        <div style={{ padding: '16px 0' }}>
          <MonthlyStatsTable />
        </div>
      </TabPane>
    </Tabs>
  );
};

export default LogsPage;
