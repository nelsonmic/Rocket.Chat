// @ts-nocheck
import { useMutableCallback } from '@rocket.chat/fuselage-hooks';
import React, { ReactElement } from 'react';

import GenericModal from '../../../components/GenericModal';
import GenericTable from '../../../components/GenericTable';
import { useSetModal } from '../../../contexts/ModalContext';
import { useEndpoint } from '../../../contexts/ServerContext';
import { useToastMessageDispatch } from '../../../contexts/ToastMessagesContext';
import { useTranslation } from '../../../contexts/TranslationContext';
import UserRow from './UserRow';

function UsersInRoleTable({
	data,
	reload,
	roleName,
	description,
	total,
	params,
	setParams,
	rid,
}): ReactElement {
	const t = useTranslation();
	const dispatchToastMessage = useToastMessageDispatch();

	const setModal = useSetModal();
	const closeModal = (): void => setModal();

	const removeUser = useEndpoint('POST', 'roles.removeUserFromRole');

	const onRemove = useMutableCallback((username) => {
		const remove = async (): Promise<void> => {
			try {
				await removeUser({ roleName, username, rid });
				dispatchToastMessage({ type: 'success', message: t('User_removed') });
			} catch (error) {
				dispatchToastMessage({ type: 'error', message: error });
			}
			closeModal();
			reload();
		};

		setModal(
			<GenericModal
				variant='danger'
				onConfirm={remove}
				onCancel={closeModal}
				confirmText={t('Delete')}
			>
				{t('The_user_s_will_be_removed_from_role_s', username, description || roleName)}
			</GenericModal>,
		);
	});

	return (
		<GenericTable
			header={
				<>
					<GenericTable.HeaderCell>{t('Name')}</GenericTable.HeaderCell>
					<GenericTable.HeaderCell>{t('Email')}</GenericTable.HeaderCell>
					<GenericTable.HeaderCell w='x80'></GenericTable.HeaderCell>
				</>
			}
			results={data}
			params={params}
			setParams={setParams}
			total={total}
		>
			{(props): ReactElement => <UserRow onRemove={onRemove} key={props._id} {...props} />}
		</GenericTable>
	);
}

export default UsersInRoleTable;