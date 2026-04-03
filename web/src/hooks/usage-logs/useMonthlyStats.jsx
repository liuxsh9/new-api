import { useState, useCallback } from 'react';
import { API, showError } from '../../helpers';

export function useMonthlyStats() {
  const [monthlyStats, setMonthlyStats] = useState([]);
  const [channelStats, setChannelStats] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchMonthlyStats = useCallback(async (startTimestamp, endTimestamp) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (startTimestamp) params.append('start_timestamp', startTimestamp);
      if (endTimestamp) params.append('end_timestamp', endTimestamp);

      const [totalRes, channelRes] = await Promise.all([
        API.get(`/api/log/monthly_stat?${params.toString()}`),
        API.get(`/api/log/monthly_stat/channel?${params.toString()}`),
      ]);

      const totalData = totalRes.data;
      if (totalData.success) {
        setMonthlyStats(totalData.data || []);
      } else {
        showError(totalData.message);
      }

      const channelData = channelRes.data;
      if (channelData.success) {
        setChannelStats(channelData.data || []);
      } else {
        showError(channelData.message);
      }
    } catch (error) {
      showError(error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  return { monthlyStats, channelStats, loading, fetchMonthlyStats };
}
