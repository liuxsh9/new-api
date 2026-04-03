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
import { Modal, Tabs, TabPane, Typography, Spin, Toast, Tag, Collapsible } from '@douyinfe/semi-ui';
import { API } from '../../../../helpers';

const { Text } = Typography;

const preStyle = {
  background: '#f6f8fa',
  padding: '12px',
  borderRadius: '6px',
  maxHeight: '500px',
  overflow: 'auto',
  fontSize: '12px',
  lineHeight: '1.5',
  fontFamily: 'Menlo, Monaco, Consolas, "Courier New", monospace',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-all',
  margin: 0,
};

const messageStyle = {
  padding: '10px 14px',
  borderRadius: '8px',
  marginBottom: '8px',
  fontSize: '13px',
  lineHeight: '1.6',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
};

const thinkingBlockStyle = {
  background: '#fdf6ec',
  border: '1px solid #f0d9a0',
  borderRadius: '6px',
  padding: '10px 14px',
  marginBottom: '6px',
  fontSize: '12px',
  lineHeight: '1.5',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  color: '#8a6914',
  maxHeight: '400px',
  overflow: 'auto',
};

const LogDetailModal = ({ visible, onClose, requestId, t }) => {
  const [loading, setLoading] = useState(false);
  const [logDetail, setLogDetail] = useState(null);

  React.useEffect(() => {
    if (visible && requestId) {
      fetchLogDetail();
    }
  }, [visible, requestId]);

  const fetchLogDetail = async () => {
    setLoading(true);
    try {
      const res = await API.get(`/api/log/detail/${requestId}`);
      const { success, message, data } = res.data;
      if (success) {
        setLogDetail(data);
      } else {
        Toast.error(message || t('获取日志详情失败'));
      }
    } catch (error) {
      Toast.error(t('获取日志详情失败') + ': ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const formatJSON = (jsonStr) => {
    if (!jsonStr) return t('无数据');
    try {
      const obj = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr;
      return JSON.stringify(obj, null, 2);
    } catch (e) {
      return jsonStr;
    }
  };

  // Parse SSE stream data into thinking + content parts
  const parseStreamResponse = (rawStr) => {
    if (!rawStr) return null;
    const lines = rawStr.split('\n').filter(Boolean);
    const thinkingChunks = [];
    const contentChunks = [];
    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        const delta = obj?.choices?.[0]?.delta;
        if (!delta) continue;
        // Thinking/reasoning content (deepseek, qwq, o1, etc.)
        const reasoning = delta.reasoning_content ?? delta.reasoning ?? null;
        if (reasoning) {
          thinkingChunks.push(reasoning);
        }
        // Normal content
        if (delta.content) {
          contentChunks.push(delta.content);
        }
      } catch {
        // not JSON, skip
      }
    }
    if (thinkingChunks.length === 0 && contentChunks.length === 0) return null;
    return {
      thinking: thinkingChunks.length > 0 ? thinkingChunks.join('') : null,
      content: contentChunks.length > 0 ? contentChunks.join('') : null,
    };
  };

  // Extract messages from a chat completion request/response body
  const extractMessages = (jsonStr) => {
    if (!jsonStr) return null;
    try {
      const obj = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr;
      // Request format: { messages: [{role, content}] }
      if (Array.isArray(obj?.messages)) {
        return obj.messages;
      }
      // Non-streaming response: { choices: [{message: {role, content, reasoning_content}}] }
      if (Array.isArray(obj?.choices) && obj.choices[0]?.message) {
        return [obj.choices[0].message];
      }
      return null;
    } catch {
      return null;
    }
  };

  const getRoleName = (role) => {
    const roleMap = {
      system: t('系统提示'),
      user: t('用户'),
      assistant: t('助手'),
      tool: t('工具'),
    };
    return roleMap[role] || role;
  };

  const getRoleColor = (role) => {
    const colorMap = {
      system: '#e8e3f3',
      user: '#e3f0ff',
      assistant: '#f0f7e6',
      tool: '#fff3e0',
    };
    return colorMap[role] || '#f5f5f5';
  };

  // Render a thinking/reasoning block
  const renderThinkingBlock = (thinkingText) => {
    if (!thinkingText) return null;
    return (
      <div style={thinkingBlockStyle}>
        <Text strong size='small' style={{ display: 'block', marginBottom: '4px', color: '#a07d1c' }}>
          💭 {t('思考过程')}
        </Text>
        {thinkingText}
      </div>
    );
  };

  // Render conversation view (human-readable messages)
  const renderConversation = (jsonStr) => {
    const messages = extractMessages(jsonStr);
    if (!messages) return null;

    return (
      <div style={{ marginBottom: '12px' }}>
        <Tag color='blue' style={{ marginBottom: '8px' }}>
          {t('对话视图')}
        </Tag>
        <div>
          {messages.map((msg, idx) => {
            // Extract thinking/reasoning content
            const reasoning = msg.reasoning_content || msg.reasoning || null;

            let content = '';
            if (typeof msg.content === 'string') {
              content = msg.content;
            } else if (Array.isArray(msg.content)) {
              content = msg.content
                .map((part) => {
                  if (typeof part === 'string') return part;
                  if (part?.type === 'text') return part.text;
                  if (part?.type === 'image_url') return `[${t('图片')}]`;
                  return JSON.stringify(part);
                })
                .join('\n');
            }
            return (
              <div
                key={idx}
                style={{
                  ...messageStyle,
                  background: getRoleColor(msg.role),
                }}
              >
                <Text strong size='small' style={{ marginBottom: '4px', display: 'block' }}>
                  {getRoleName(msg.role)}
                </Text>
                {reasoning && renderThinkingBlock(reasoning)}
                {content || (!reasoning && <Text type='tertiary' italic>{t('无内容')}</Text>)}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Render stream-extracted text for upstream response
  const renderStreamText = (rawStr) => {
    const parsed = parseStreamResponse(rawStr);
    if (!parsed) return null;

    return (
      <div style={{ marginBottom: '12px' }}>
        <Tag color='green' style={{ marginBottom: '8px' }}>
          {t('助手回复')} ({t('流式')})
        </Tag>
        <div style={{ ...messageStyle, background: getRoleColor('assistant') }}>
          {parsed.thinking && renderThinkingBlock(parsed.thinking)}
          {parsed.content || (!parsed.thinking && <Text type='tertiary' italic>{t('无内容')}</Text>)}
        </div>
      </div>
    );
  };

  // Determine if upstream response is streaming (contains multiple JSON objects separated by newlines)
  const isStreamingResponse = (rawStr) => {
    if (!rawStr) return false;
    const lines = rawStr.split('\n').filter(Boolean);
    if (lines.length < 2) return false;
    try {
      JSON.parse(lines[0]);
      return true;
    } catch {
      return false;
    }
  };

  const renderTabContent = (jsonStr, type) => {
    if (!jsonStr) {
      return (
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <Text type='tertiary'>{t('无数据')}</Text>
        </div>
      );
    }

    const isStream = type === 'upstream_response' && isStreamingResponse(jsonStr);
    const conversation = renderConversation(jsonStr);
    const streamText = isStream ? renderStreamText(jsonStr) : null;

    return (
      <div>
        {conversation}
        {streamText}
        <Collapsible isOpen={!conversation && !streamText} keepDOM={false}>
          <pre style={preStyle}>{formatJSON(jsonStr)}</pre>
        </Collapsible>
        {(conversation || streamText) && (
          <details style={{ marginTop: '8px' }}>
            <summary style={{ cursor: 'pointer', fontSize: '12px', color: 'var(--semi-color-text-2)' }}>
              {t('原始数据')}
            </summary>
            <pre style={{ ...preStyle, marginTop: '8px' }}>{formatJSON(jsonStr)}</pre>
          </details>
        )}
      </div>
    );
  };

  return (
    <Modal
      title={t('请求与响应')}
      visible={visible}
      onCancel={onClose}
      footer={null}
      width={960}
      style={{ maxHeight: '85vh' }}
      bodyStyle={{ maxHeight: 'calc(85vh - 60px)', overflow: 'auto' }}
    >
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <Spin size='large' />
        </div>
      ) : logDetail ? (
        <Tabs type='line'>
          <TabPane tab={t('客户端请求')} itemKey='client_request'>
            {renderTabContent(logDetail.request_body, 'client_request')}
          </TabPane>
          <TabPane tab={t('客户端响应')} itemKey='client_response'>
            {renderTabContent(logDetail.response_body, 'client_response')}
          </TabPane>
          <TabPane tab={t('上游请求')} itemKey='upstream_request'>
            {renderTabContent(logDetail.upstream_request, 'upstream_request')}
          </TabPane>
          <TabPane tab={t('上游响应')} itemKey='upstream_response'>
            {renderTabContent(logDetail.upstream_response, 'upstream_response')}
          </TabPane>
        </Tabs>
      ) : (
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <Text type='tertiary'>{t('暂无详细日志数据')}</Text>
        </div>
      )}
    </Modal>
  );
};

export default LogDetailModal;
