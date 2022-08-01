import { IUser } from '@rocket.chat/core-typings';
import { Users } from '@rocket.chat/models';

import { RocketChatUserAdapter } from '../../../../../../../app/federation-v2/server/infrastructure/rocket-chat/adapters/User';

export class RocketChatUserAdapterEE extends RocketChatUserAdapter {
	public async createLocalUser(internalUser: IUser): Promise<void> {
		const existingLocalUser = await Users.findOneByUsername(internalUser.username || '');
		if (existingLocalUser) {
			return;
		}
		await Users.insertOne({
			username: internalUser.username,
			type: internalUser.type,
			status: internalUser.status,
			active: internalUser.active,
			roles: internalUser.roles,
			name: internalUser.name,
			requirePasswordChange: internalUser.requirePasswordChange,
			createdAt: new Date(),
			federated: internalUser.federated,
		});
	}
}
