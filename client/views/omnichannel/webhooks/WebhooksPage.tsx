// @ts-nocheck
import {
	Box,
	FieldGroup,
	Field,
	TextInput,
	MultiSelect,
	Button,
	ButtonGroup,
} from '@rocket.chat/fuselage';
import { useMutableCallback } from '@rocket.chat/fuselage-hooks';
import React, { ReactElement, useMemo } from 'react';

import ExternalLink from '../../../components/ExternalLink';
import Page from '../../../components/Page';
import { useMethod } from '../../../contexts/ServerContext';
import { useToastMessageDispatch } from '../../../contexts/ToastMessagesContext';
import { useTranslation } from '../../../contexts/TranslationContext';
import { useForm } from '../../../hooks/useForm';

const reduceSendOptions = (options): unknown[] =>
	Object.entries(options).reduce((acc, [key, val]) => {
		if (val) {
			acc = [...acc, key];
		}
		return acc;
	}, []);

const integrationsUrl = 'https://docs.rocket.chat/guides/omnichannel/webhooks-managers-guide';

const getInitialValues = ({
	// eslint-disable-next-line @typescript-eslint/camelcase
	Livechat_webhookUrl,
	// eslint-disable-next-line @typescript-eslint/camelcase
	Livechat_secret_token,
	// eslint-disable-next-line @typescript-eslint/camelcase
	Livechat_webhook_on_start,
	// eslint-disable-next-line @typescript-eslint/camelcase
	Livechat_webhook_on_close,
	// eslint-disable-next-line @typescript-eslint/camelcase
	Livechat_webhook_on_chat_taken,
	// eslint-disable-next-line @typescript-eslint/camelcase
	Livechat_webhook_on_chat_queued,
	// eslint-disable-next-line @typescript-eslint/camelcase
	Livechat_webhook_on_forward,
	// eslint-disable-next-line @typescript-eslint/camelcase
	Livechat_webhook_on_offline_msg,
	// eslint-disable-next-line @typescript-eslint/camelcase
	Livechat_webhook_on_visitor_message,
	// eslint-disable-next-line @typescript-eslint/camelcase
	Livechat_webhook_on_agent_message,
}): ReactElement => {
	const sendOptions = {
		// eslint-disable-next-line @typescript-eslint/camelcase
		Livechat_webhook_on_start,
		// eslint-disable-next-line @typescript-eslint/camelcase
		Livechat_webhook_on_close,
		// eslint-disable-next-line @typescript-eslint/camelcase
		Livechat_webhook_on_chat_taken,
		// eslint-disable-next-line @typescript-eslint/camelcase
		Livechat_webhook_on_chat_queued,
		// eslint-disable-next-line @typescript-eslint/camelcase
		Livechat_webhook_on_forward,
		// eslint-disable-next-line @typescript-eslint/camelcase
		Livechat_webhook_on_offline_msg,
		// eslint-disable-next-line @typescript-eslint/camelcase
		Livechat_webhook_on_visitor_message,
		// eslint-disable-next-line @typescript-eslint/camelcase
		Livechat_webhook_on_agent_message,
	};

	const mappedSendOptions = reduceSendOptions(sendOptions);

	return {
		// eslint-disable-next-line @typescript-eslint/camelcase
		Livechat_webhookUrl,
		// eslint-disable-next-line @typescript-eslint/camelcase
		Livechat_secret_token,
		sendOn: mappedSendOptions,
	};
};

const WebhooksPage = ({ settings }): ReactElement => {
	const t = useTranslation();
	const dispatchToastMessage = useToastMessageDispatch();

	const { values, handlers, hasUnsavedChanges, reset, commit } = useForm(
		getInitialValues(settings),
	);

	const save = useMethod('livechat:saveIntegration');
	const test = useMethod('livechat:webhookTest');

	// eslint-disable-next-line @typescript-eslint/camelcase
	const { Livechat_webhookUrl, Livechat_secret_token, sendOn } = values;

	// eslint-disable-next-line @typescript-eslint/camelcase
	const { handleLivechat_webhookUrl, handleLivechat_secret_token, handleSendOn } = handlers;

	const sendOptions = useMemo(
		() => [
			['Livechat_webhook_on_start', t('Chat_start')],
			['Livechat_webhook_on_close', t('Chat_close')],
			['Livechat_webhook_on_chat_taken', t('Chat_taken')],
			['Livechat_webhook_on_chat_queued', t('Chat_queued')],
			['Livechat_webhook_on_forward', t('Forwarding')],
			['Livechat_webhook_on_offline_msg', t('Offline_messages')],
			['Livechat_webhook_on_visitor_message', t('Visitor_message')],
			['Livechat_webhook_on_agent_message', t('Agent_messages')],
		],
		[t],
	);

	const handleSave = useMutableCallback(async () => {
		const sendOnObj = sendOptions.reduce((acc, [key]) => {
			acc = { ...acc, [key]: sendOn.includes(key) ? 1 : 0 };
			return acc;
		}, {});

		try {
			// eslint-disable-next-line @typescript-eslint/camelcase
			await save({ Livechat_webhookUrl, Livechat_secret_token, ...sendOnObj });
			dispatchToastMessage({ type: 'success', message: t('Saved') });
			commit();
		} catch (error) {
			dispatchToastMessage({ type: 'error', message: error });
		}
	});

	const handleTest = useMutableCallback(async () => {
		try {
			await test();
			dispatchToastMessage({ type: 'success', message: t('It_works') });
			commit();
		} catch (error) {
			dispatchToastMessage({ type: 'error', message: error });
		}
	});

	return (
		<Page>
			<Page.Header title={t('Webhooks')}>
				<ButtonGroup>
					<Button onClick={(): void => reset()}>{t('Reset')}</Button>
					<Button
						onClick={handleTest}
						// eslint-disable-next-line @typescript-eslint/camelcase
						disabled={!Livechat_webhookUrl || hasUnsavedChanges}
					>
						{t('Send_Test')}
					</Button>
					<Button primary onClick={handleSave} disabled={!hasUnsavedChanges}>
						{t('Save')}
					</Button>
				</ButtonGroup>
			</Page.Header>
			<Page.ScrollableContentWithShadow>
				<Box maxWidth='x600' w='full' alignSelf='center'>
					<p>{t('You_can_use_webhooks_to_easily_integrate_livechat_with_your_CRM')}</p>
					<p>
						<ExternalLink to={integrationsUrl}>{t('Click_here')}</ExternalLink>{' '}
						{t('to_see_more_details_on_how_to_integrate')}
					</p>
					<FieldGroup style={{ marginTop: '1.5rem' }}>
						<Field>
							<Field.Label>{t('Webhook_URL')}</Field.Label>
							<Field.Row>
								<TextInput
									// eslint-disable-next-line @typescript-eslint/camelcase
									value={Livechat_webhookUrl}
									// eslint-disable-next-line @typescript-eslint/camelcase
									onChange={handleLivechat_webhookUrl}
									placeholder='https://yourdomain.com/webhook/entrypoint'
								/>
							</Field.Row>
						</Field>
						<Field>
							<Field.Label>{t('Secret_token')}</Field.Label>
							<Field.Row>
								<TextInput
									// eslint-disable-next-line @typescript-eslint/camelcase
									value={Livechat_secret_token}
									// eslint-disable-next-line @typescript-eslint/camelcase
									onChange={handleLivechat_secret_token}
									placeholder={t('Secret_token')}
								/>
							</Field.Row>
						</Field>
						<Field>
							<Field.Label>{t('Send_request_on')}</Field.Label>
							<Field.Row>
								<Box w='full' display='flex' alignItems='stretch' justifyContent='stretch'>
									<MultiSelect
										w='full'
										value={sendOn}
										onChange={handleSendOn}
										options={sendOptions}
										placeholder={t('Select_an_option')}
									/>
								</Box>
							</Field.Row>
						</Field>
					</FieldGroup>
				</Box>
			</Page.ScrollableContentWithShadow>
		</Page>
	);
};

export default WebhooksPage;