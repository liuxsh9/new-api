import React, { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  API,
  downloadTextAsFile,
  showError,
  showSuccess,
} from '../../../../helpers';
import { useIsMobile } from '../../../../hooks/common/useIsMobile';
import {
  Button,
  Modal,
  SideSheet,
  Space,
  Spin,
  Typography,
  Card,
  Form,
  Avatar,
  Row,
  Col,
  Tag,
} from '@douyinfe/semi-ui';
import { IconSave, IconClose, IconKey } from '@douyinfe/semi-icons';

const { Text, Title } = Typography;

const EditInvitationCodeModal = (props) => {
  const { t } = useTranslation();
  const isEdit = props.editingCode.id !== undefined;
  const [loading, setLoading] = useState(isEdit);
  const isMobile = useIsMobile();
  const formApiRef = useRef(null);

  const getInitValues = () => ({
    name: '',
    code: '',
    count: 1,
    expired_at: null,
  });

  const handleCancel = () => {
    props.handleClose();
  };

  const loadCode = async () => {
    setLoading(true);
    let res = await API.get(
      `/api/user/invitation_code/${props.editingCode.id}`,
    );
    const { success, message, data } = res.data;
    if (success) {
      if (data.expired_at === 0) {
        data.expired_at = null;
      } else {
        data.expired_at = new Date(data.expired_at * 1000);
      }
      formApiRef.current?.setValues({ ...getInitValues(), ...data });
    } else {
      showError(message);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (formApiRef.current) {
      if (isEdit) {
        loadCode();
      } else {
        formApiRef.current.setValues(getInitValues());
      }
    }
  }, [props.editingCode.id]);

  const submit = async (values) => {
    setLoading(true);
    let localInputs = { ...values };
    localInputs.count = parseInt(localInputs.count) || 0;
    if (!localInputs.expired_at) {
      localInputs.expired_at = 0;
    } else {
      localInputs.expired_at = Math.floor(
        localInputs.expired_at.getTime() / 1000,
      );
    }
    let res;
    if (isEdit) {
      res = await API.put(`/api/user/invitation_code/`, {
        ...localInputs,
        id: parseInt(props.editingCode.id),
      });
    } else {
      res = await API.post(`/api/user/invitation_code/`, {
        ...localInputs,
      });
    }
    const { success, message, data } = res.data;
    if (success) {
      if (isEdit) {
        showSuccess(t('邀请码更新成功！'));
      } else {
        showSuccess(t('邀请码创建成功！'));
      }
      props.refresh();
      props.handleClose();

      if (!isEdit && data) {
        let text = '';
        for (let i = 0; i < data.length; i++) {
          text += data[i] + '\n';
        }
        Modal.confirm({
          title: t('邀请码创建成功'),
          content: (
            <div>
              <p>{t('邀请码创建成功，是否下载邀请码？')}</p>
            </div>
          ),
          onOk: () => {
            downloadTextAsFile(text, `${localInputs.name}.txt`);
          },
        });
      }
    } else {
      showError(message);
    }
    setLoading(false);
  };

  return (
    <SideSheet
      placement={isEdit ? 'right' : 'left'}
      title={
        <Space>
          {isEdit ? (
            <Tag color='blue' shape='circle'>
              {t('更新')}
            </Tag>
          ) : (
            <Tag color='green' shape='circle'>
              {t('新建')}
            </Tag>
          )}
          <Title heading={4} className='m-0'>
            {isEdit ? t('更新邀请码信息') : t('创建新的邀请码')}
          </Title>
        </Space>
      }
      bodyStyle={{ padding: '0' }}
      visible={props.visiable}
      width={isMobile ? '100%' : 600}
      footer={
        <div className='flex justify-end bg-white'>
          <Space>
            <Button
              theme='solid'
              onClick={() => formApiRef.current?.submitForm()}
              icon={<IconSave />}
              loading={loading}
            >
              {t('提交')}
            </Button>
            <Button
              theme='light'
              type='primary'
              onClick={handleCancel}
              icon={<IconClose />}
            >
              {t('取消')}
            </Button>
          </Space>
        </div>
      }
      closeIcon={null}
      onCancel={() => handleCancel()}
    >
      <Spin spinning={loading}>
        <Form
          initValues={getInitValues()}
          getFormApi={(api) => (formApiRef.current = api)}
          onSubmit={submit}
        >
          {({ formState }) => (
            <div className='p-2'>
              <Card className='!rounded-2xl shadow-sm border-0 mb-6'>
                <div className='flex items-center mb-2'>
                  <Avatar
                    size='small'
                    color='blue'
                    className='mr-2 shadow-md'
                  >
                    <IconKey size={16} />
                  </Avatar>
                  <div>
                    <Text className='text-lg font-medium'>
                      {t('基本信息')}
                    </Text>
                    <div className='text-xs text-gray-600'>
                      {t('设置邀请码的基本信息')}
                    </div>
                  </div>
                </div>

                <Row gutter={12}>
                  <Col span={24}>
                    <Form.Input
                      field='name'
                      label={t('名称')}
                      placeholder={t('请输入名称')}
                      style={{ width: '100%' }}
                      rules={[{ required: true, message: t('请输入名称') }]}
                      showClear
                    />
                  </Col>
                  {isEdit ? (
                    <Col span={24}>
                      <Form.Input
                        field='code'
                        label={t('邀请码')}
                        style={{ width: '100%' }}
                        disabled
                      />
                    </Col>
                  ) : (
                    <Col span={24}>
                      <Form.Input
                        field='code'
                        label={t('邀请码（留空则自动生成）')}
                        placeholder={t('自定义邀请码，留空则自动生成')}
                        style={{ width: '100%' }}
                        showClear
                        onChange={(value) => {
                          // 自定义码时隐藏生成数量
                          if (value) {
                            formApiRef.current?.setValue('count', 1);
                          }
                        }}
                      />
                    </Col>
                  )}
                  <Col span={24}>
                    <Form.DatePicker
                      field='expired_at'
                      label={t('过期时间')}
                      type='dateTime'
                      placeholder={t('选择过期时间（可选，留空为永久）')}
                      style={{ width: '100%' }}
                      showClear
                    />
                  </Col>
                  {!isEdit && !formState?.values?.code && (
                    <Col span={24}>
                      <Form.InputNumber
                        field='count'
                        label={t('生成数量')}
                        min={1}
                        max={100}
                        rules={[
                          { required: true, message: t('请输入生成数量') },
                        ]}
                        style={{ width: '100%' }}
                        showClear
                      />
                    </Col>
                  )}
                </Row>
              </Card>
            </div>
          )}
        </Form>
      </Spin>
    </SideSheet>
  );
};

export default EditInvitationCodeModal;
