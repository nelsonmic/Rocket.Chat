import { RoomType } from '@rocket.chat/apps-engine/definition/rooms';

import { FederationService } from '../../../../../../app/federation-v2/server/application/AbstractFederationService';

// import { FederationRoomServiceSender } from '../../../../../app/federation-v2/server/application/RoomServiceSender';
import { FederatedUser } from '../../../../../../app/federation-v2/server/domain/FederatedUser';
import { RocketChatSettingsAdapter } from '../../../../../../app/federation-v2/server/infrastructure/rocket-chat/adapters/Settings';
import { FederatedRoomEE } from '../../domain/FederatedRoom';
import { FederatedUserEE } from '../../domain/FederatedUser';
import { IFederationBridgeEE } from '../../domain/IFederationBridge';
import { RocketChatNotificationAdapter } from '../../infrastructure/rocket-chat/adapters/Notification';
import { RocketChatRoomAdapterEE } from '../../infrastructure/rocket-chat/adapters/Room';
import { RocketChatUserAdapterEE } from '../../infrastructure/rocket-chat/adapters/User';
import {
	FederationBeforeAddUserToARoomDto,
	FederationBeforeDirectMessageRoomCreationDto,
	FederationCreateDirectMessageDto,
	FederationOnDirectMessageRoomCreationDto,
	FederationOnRoomCreationDto,
	FederationOnUsersAddedToARoomDto,
	FederationRoomInviteUserDto,
	FederationSetupRoomDto,
} from '../input/RoomSenderDto';

export class FederationRoomInternalHooksServiceSender extends FederationService {
	constructor(
		protected rocketRoomAdapter: RocketChatRoomAdapterEE,
		protected rocketUserAdapter: RocketChatUserAdapterEE,
		protected rocketSettingsAdapter: RocketChatSettingsAdapter,
		protected rocketNotificationAdapter: RocketChatNotificationAdapter,
		protected bridge: IFederationBridgeEE,
	) {
		super(bridge, rocketUserAdapter, rocketSettingsAdapter);
	}

	public async onRoomCreated(roomOnCreationInput: FederationOnRoomCreationDto): Promise<void> {
		const { internalInviterId, internalRoomId, invitees } = roomOnCreationInput;
		await this.setupFederatedRoom({ internalInviterId, internalRoomId });

		if (invitees.length === 0) {
			return;
		}
		await Promise.all(
			invitees.map((member) =>
				this.inviteUserToAFederatedRoomWhenCreate({
					internalInviterId,
					internalRoomId,
					inviteeUsernameOnly: member.inviteeUsernameOnly,
					normalizedInviteeId: member.normalizedInviteeId,
					rawInviteeId: member.rawInviteeId,
				}),
			),
		);
	}

	public async beforeAddUserToARoom(dmBeforeAddUserToARoomInput: FederationBeforeAddUserToARoomDto): Promise<void> {
		const { invitees = [] } = dmBeforeAddUserToARoomInput;
		if (invitees.length === 0) {
			return;
		}

		// const externalUsersToBeCreatedLocally = invitees.filter(
		// 	(invitee) => !this.bridge.isUserIdFromTheSameHomeserver(invitee.rawInviteeId, this.rocketSettingsAdapter.getHomeServerDomain()),
		// );
		// const isInviterFromTheSameHomeServer = FederatedUser.isAnInternalUser(
		// 	this.bridge.extractHomeserverOrigin(externalInviterId),
		// 	internalHomeServerDomain,
		// );
		const externalUsersToBeCreatedLocally = invitees.filter((invitee) =>
			!FederatedUserEE.isAnInternalUser(this.bridge.extractHomeserverOrigin(invitee.rawInviteeId), this.internalHomeServerDomain),
		);

		await Promise.all(
			externalUsersToBeCreatedLocally.map((invitee) =>
				this.rocketUserAdapter.createLocalUser(
					FederatedUserEE.createInstance('', {
						username: invitee.normalizedInviteeId,
						name: invitee.normalizedInviteeId,
						existsOnlyOnProxyServer: false,
					}),
				),
			),
		);
	}

	public async onUsersAddedToARoom(roomOnUsersAddedToARoomInput: FederationOnUsersAddedToARoomDto): Promise<void> {
		const { internalInviterId, internalRoomId, invitees, inviteComesFromAnExternalHomeServer } = roomOnUsersAddedToARoomInput;

		if (inviteComesFromAnExternalHomeServer) {
			return;
		}

		await Promise.all(
			invitees.map((member) =>
				this.inviteUserToAFederatedRoomWhenAddUser({
					internalInviterId,
					internalRoomId,
					inviteeUsernameOnly: member.inviteeUsernameOnly,
					normalizedInviteeId: member.normalizedInviteeId,
					rawInviteeId: member.rawInviteeId,
				}),
			),
		);
	}

	public async afterRoomNameChanged(internalRoomId: string, internalRoomName: string): Promise<void> {
		const federatedRoom = await this.rocketRoomAdapter.getFederatedRoomByInternalId(internalRoomId);
		if (!federatedRoom) {
			return;
		}

		const federatedUser = await this.rocketUserAdapter.getFederatedUserByInternalId(federatedRoom.internalReference.u._id);
		if (!federatedUser) {
			return;
		}

		const isRoomFromTheSameHomeServer = FederatedRoomEE.isAnInternalRoom(
			this.bridge.extractHomeserverOrigin(federatedRoom.externalId),
			this.rocketSettingsAdapter.getHomeServerDomain(),
		);
		const externalRoomName = await this.bridge.getRoomName(federatedRoom.externalId, federatedUser.externalId);

		if (!isRoomFromTheSameHomeServer || !federatedRoom.shouldUpdateRoomName(externalRoomName || '')) {
			return;
		}

		// const externalRoomName = await this.bridge.getRoomName(federatedRoom.externalId, federatedUser.externalId);
		// if (externalRoomName === internalRoomName) {
		// 	return;
		// }
		await this.bridge.setRoomName(federatedRoom.externalId, federatedUser.externalId, internalRoomName);
	}

	public async afterRoomTopicChanged(internalRoomId: string, internalRoomTopic: string): Promise<void> {
		const federatedRoom = await this.rocketRoomAdapter.getFederatedRoomByInternalId(internalRoomId);
		if (!federatedRoom) {
			return;
		}

		const federatedUser = await this.rocketUserAdapter.getFederatedUserByInternalId(federatedRoom.internalReference.u._id);
		if (!federatedUser) {
			return;
		}

		// if (!this.bridge.isRoomFromTheSameHomeserver(federatedRoom.externalId, this.rocketSettingsAdapter.getHomeServerDomain())) {
		// 	return;
		// }
		const isRoomFromTheSameHomeServer = FederatedRoomEE.isAnInternalRoom(
			this.bridge.extractHomeserverOrigin(federatedRoom.externalId),
			this.rocketSettingsAdapter.getHomeServerDomain(),
		);
		const externalRoomTopic = await this.bridge.getRoomTopic(federatedRoom.externalId, federatedUser.externalId);
		// if (federatedRoom.isDirectMessage()) {
		// 	return;
		// }

		// const externalRoomTopic = await this.bridge.getRoomTopic(federatedRoom.externalId, federatedUser.externalId);
		// if (externalRoomTopic === internalRoomTopic) {
		// 	return;
		// }
		if (!isRoomFromTheSameHomeServer || !federatedRoom.shouldUpdateRoomName(externalRoomTopic || '')) {
			return;
		}
		await this.bridge.setRoomTopic(federatedRoom.externalId, federatedUser.externalId, internalRoomTopic);
	}

	private async setupFederatedRoom(roomInviteUserInput: FederationSetupRoomDto): Promise<void> {
		const { internalInviterId, internalRoomId } = roomInviteUserInput;

		const inviterUser = await this.rocketUserAdapter.getFederatedUserByInternalId(internalInviterId);
		if (!inviterUser) {
			const internalUser = await this.internalUserAdapter.getInternalUserById(internalInviterId);
			if (!internalUser || !internalUser?.username) {
				throw new Error(`Could not find user id for ${ internalInviterId }`);
			}
			const name = internalUser.name || internalUser.username;
			const externalInviterId = await this.bridge.createUser(
				internalUser.username,
				name,
				this.internalSettingsAdapter.getHomeServerDomain(),
			);
			const existsOnlyOnProxyServer = true;
			await this.createFederatedUser(externalInviterId, internalUser.username, existsOnlyOnProxyServer, name);
			// const internalUser = await this.rocketUserAdapter.getInternalUserById(internalInviterId);
			// if (!internalUser || !internalUser.username) {
			// 	throw new Error(`User with internalId ${internalInviterId} not found`);
			// }
			// const externalInviterId = await this.bridge.createUser(
			// 	internalUser.username,
			// 	internalUser.name || internalUser.username,
			// 	this.rocketSettingsAdapter.getHomeServerDomain(),
			// );
			// const federatedInviterUser = FederatedUser.createInstance(externalInviterId, {
			// 	name: internalUser.name || internalUser.username,
			// 	username: internalUser.username,
			// 	existsOnlyOnProxyServer: true,
			// });
			// await this.rocketUserAdapter.createFederatedUser(federatedInviterUser);
		}

		const federatedInviterUser = inviterUser || (await this.rocketUserAdapter.getFederatedUserByInternalId(internalInviterId));
		if (!federatedInviterUser) {
			throw new Error(`User with internalId ${ internalInviterId } not found`);
		}

		const internalFederatedRoom = await this.rocketRoomAdapter.getFederatedRoomByInternalId(internalRoomId);
		if (!internalFederatedRoom) {
			const internalRoom = await this.rocketRoomAdapter.getInternalRoomById(internalRoomId);
			if (!internalRoom || !internalRoom.name) {
				throw new Error(`Room with internalId ${ internalRoomId } not found`);
			}
			const roomName = internalRoom.fname || internalRoom.name;
			const externalRoomId = await this.bridge.createRoom(federatedInviterUser.externalId, internalRoom.t, roomName, internalRoom.topic);
			const newFederatedRoom = FederatedRoomEE.createInstanceEE(
				externalRoomId,
				externalRoomId,
				federatedInviterUser,
				internalRoom.t,
				roomName,
			);
			await this.rocketRoomAdapter.updateFederatedRoomByInternalRoomId(internalRoom._id, newFederatedRoom);
		}
		// const { internalInviterId, internalRoomId } = roomInviteUserInput;

		// if (!(await this.rocketUserAdapter.getFederatedUserByInternalId(internalInviterId))) {
		// 	const internalUser = await this.rocketUserAdapter.getInternalUserById(internalInviterId);
		// 	if (!internalUser || !internalUser.username) {
		// 		throw new Error(`User with internalId ${internalInviterId} not found`);
		// 	}
		// 	const externalInviterId = await this.bridge.createUser(
		// 		internalUser.username,
		// 		internalUser.name || internalUser.username,
		// 		this.rocketSettingsAdapter.getHomeServerDomain(),
		// 	);
		// 	const federatedInviterUser = FederatedUser.createInstance(externalInviterId, {
		// 		name: internalUser.name || internalUser.username,
		// 		username: internalUser.username,
		// 		existsOnlyOnProxyServer: true,
		// 	});
		// 	await this.rocketUserAdapter.createFederatedUser(federatedInviterUser);
		// }

		// const federatedInviterUser = await this.rocketUserAdapter.getFederatedUserByInternalId(internalInviterId);
		// if (!federatedInviterUser) {
		// 	throw new Error(`User with internalId ${internalInviterId} not found`);
		// }

		// if (!(await this.rocketRoomAdapter.getFederatedRoomByInternalId(internalRoomId))) {
		// 	const internalRoom = await this.rocketRoomAdapter.getInternalRoomById(internalRoomId);
		// 	if (!internalRoom || !internalRoom.name) {
		// 		throw new Error(`Room with internalId ${internalRoomId} not found`);
		// 	}
		// 	const roomName = internalRoom.fname || internalRoom.name;
		// 	const externalRoomId = await this.bridge.createRoom(federatedInviterUser.externalId, internalRoom.t, roomName, internalRoom.topic);
		// 	const newFederatedRoom = FederatedRoomEE.createInstanceEE(
		// 		externalRoomId,
		// 		externalRoomId,
		// 		federatedInviterUser,
		// 		internalRoom.t,
		// 		roomName,
		// 	);
		// 	await this.rocketRoomAdapter.updateFederatedRoomByInternalRoomId(internalRoom._id, newFederatedRoom);
		// }
	}

	private async inviteUserToAFederatedRoomWhenCreate(roomInviteUserInput: FederationRoomInviteUserDto): Promise<void> {
		const { internalInviterId, internalRoomId, normalizedInviteeId, inviteeUsernameOnly, rawInviteeId } = roomInviteUserInput;
		// const isInviteeFromTheSameHomeServer = this.bridge.isUserIdFromTheSameHomeserver(
		// 	rawInviteeId,
		// 	this.rocketSettingsAdapter.getHomeServerDomain(),
		// );
		const isInviteeFromTheSameHomeServer = FederatedUserEE.isAnInternalUser(
			this.bridge.extractHomeserverOrigin(rawInviteeId),
			this.internalHomeServerDomain,
		);
		const federatedRoom = await this.rocketRoomAdapter.getFederatedRoomByInternalId(internalRoomId);
		if (!federatedRoom) {
			throw new Error(`Could not find the room to invite. RoomId: ${ internalRoomId }`);
		}
		const federatedInviterUser = await this.rocketUserAdapter.getFederatedUserByInternalId(internalInviterId);
		if (!federatedInviterUser) {
			throw new Error(`User with internalId ${ internalInviterId } not found`);
		}

		if (isInviteeFromTheSameHomeServer) {
			const existsOnlyOnProxyServer = true;

			await this.createFederatedUserIfNecessary(inviteeUsernameOnly, rawInviteeId, existsOnlyOnProxyServer);

			const federatedInviteeUser = await this.rocketUserAdapter.getFederatedUserByInternalUsername(inviteeUsernameOnly);
			if (!federatedInviteeUser) {
				throw new Error(`User with internalUsername ${ inviteeUsernameOnly } not found`);
			}
			// if (await this.rocketRoomAdapter.isUserAlreadyJoined(internalRoomId, federatedInviteeUser.internalReference._id)) {
			// 	return;
			// }
			// await this.rocketRoomAdapter.addUserToRoom(federatedRoom, federatedInviteeUser, federatedInviterUser);
			await this.bridge.inviteToRoom(federatedRoom.externalId, federatedInviterUser.externalId, rawInviteeId);
			return;
		}

		const existsOnlyOnProxyServer = false;

		await this.createFederatedUserIfNecessary(normalizedInviteeId, rawInviteeId, existsOnlyOnProxyServer);

		const federatedInviteeUser = await this.rocketUserAdapter.getFederatedUserByInternalUsername(normalizedInviteeId);
		if (!federatedInviteeUser) {
			throw new Error(`User with internalUsername ${ normalizedInviteeId } not found`);
		}

		// if (await this.rocketRoomAdapter.isUserAlreadyJoined(internalRoomId, federatedInviteeUser.internalReference._id)) {
		// 	return;
		// }

		await this.bridge.inviteToRoom(federatedRoom.externalId, federatedInviterUser.externalId, federatedInviteeUser?.externalId);
	}

	private async inviteUserToAFederatedRoomWhenAddUser(roomInviteUserInput: FederationRoomInviteUserDto): Promise<void> {
		const { internalInviterId, internalRoomId, normalizedInviteeId, inviteeUsernameOnly, rawInviteeId } = roomInviteUserInput;
		// const isInviteeFromTheSameHomeServer = this.bridge.isUserIdFromTheSameHomeserver(
		// 	rawInviteeId,
		// 	this.rocketSettingsAdapter.getHomeServerDomain(),
		// );
		const isInviteeFromTheSameHomeServer = FederatedUserEE.isAnInternalUser(
			this.bridge.extractHomeserverOrigin(rawInviteeId),
			this.internalHomeServerDomain,
		);
		const federatedRoom = await this.rocketRoomAdapter.getFederatedRoomByInternalId(internalRoomId);
		if (!federatedRoom) {
			throw new Error(`Could not find the room to invite. RoomId: ${ internalRoomId }`);
		}
		const federatedInviterUser = await this.rocketUserAdapter.getFederatedUserByInternalId(internalInviterId);
		if (!federatedInviterUser) {
			throw new Error(`User with internalId ${ internalInviterId } not found`);
		}
		console.log({ isInviteeFromTheSameHomeServer })

		if (isInviteeFromTheSameHomeServer) {
			const existsOnlyOnProxyServer = true;

			await this.createFederatedUserIfNecessary(inviteeUsernameOnly, rawInviteeId, existsOnlyOnProxyServer);

			const federatedInviteeUser = await this.rocketUserAdapter.getFederatedUserByInternalUsername(inviteeUsernameOnly);
			if (!federatedInviteeUser) {
				throw new Error(`User with internalUsername ${ inviteeUsernameOnly } not found`);
			}
			// console.log({ federatedInviteeUser })
			// if (await this.rocketRoomAdapter.isUserAlreadyJoined(internalRoomId, federatedInviteeUser.internalReference._id)) {
			// 	return;
			// }
			const profile = await this.bridge.getUserProfileInformation(federatedInviteeUser.externalId);
			if (!profile) {
				await this.bridge.createUser(
					inviteeUsernameOnly,
					federatedInviteeUser?.internalReference?.name || federatedInviteeUser.internalReference?.username || inviteeUsernameOnly,
					this.rocketSettingsAdapter.getHomeServerDomain(),
				);
			}
			await this.bridge.inviteToRoom(federatedRoom.externalId, federatedInviterUser.externalId, federatedInviteeUser.externalId);
			// await this.rocketRoomAdapter.addUserToRoom(federatedRoom, federatedInviteeUser, federatedInviterUser);

			return;
		}

		const existsOnlyOnProxyServer = false;

		await this.createFederatedUserIfNecessary(normalizedInviteeId, rawInviteeId, existsOnlyOnProxyServer);

		const federatedInviteeUser = await this.rocketUserAdapter.getFederatedUserByInternalUsername(normalizedInviteeId);
		// if (await this.rocketRoomAdapter.isUserAlreadyJoined(internalRoomId, federatedInviteeUser?.internalReference?._id ||'')) {
		// 	return;
		// }
		if (!federatedInviteeUser) {
			throw new Error(`User with internalUsername ${ normalizedInviteeId } not found`);
		}
		await this.bridge.inviteToRoom(federatedRoom.externalId, federatedInviterUser.externalId, federatedInviteeUser?.externalId)
	}

	private async createFederatedUserIfNecessary(username: string, rawUsername: string, existsOnlyOnProxyServer = false): Promise<void> {
		if (!(await this.rocketUserAdapter.getFederatedUserByInternalUsername(username))) {
			await this.createFederatedUser(rawUsername, username, existsOnlyOnProxyServer);
			// const externalUserProfileInformation = await this.bridge.getUserProfileInformation(rawUsername);
			// const name = externalUserProfileInformation?.displayName || username;
			// const newFederatedInviteeUser = FederatedUser.createInstance(rawUsername, {
			// 	name,
			// 	username,
			// 	existsOnlyOnProxyServer,
			// });

			// await this.rocketUserAdapter.createFederatedUser(newFederatedInviteeUser);
		}
	}
}

// import { RoomType } from '@rocket.chat/apps-engine/definition/rooms';
// import { FederationService } from '../../../../../../app/federation-v2/server/application/AbstractFederationService';

// import { FederationRoomServiceSender } from '../../../../../app/federation-v2/server/application/RoomServiceSender';
// import { FederatedUser } from '../../../../../../app/federation-v2/server/domain/FederatedUser';
// import { RocketChatSettingsAdapter } from '../../../../../../app/federation-v2/server/infrastructure/rocket-chat/adapters/Settings';
// import { FederatedRoomEE } from '../../domain/FederatedRoom';
// import { FederatedUserEE } from '../../domain/FederatedUser';
// import { IFederationBridgeEE } from '../../domain/IFederationBridge';
// import { RocketChatNotificationAdapter } from '../../infrastructure/rocket-chat/adapters/Notification';
// import { RocketChatRoomAdapterEE } from '../../infrastructure/rocket-chat/adapters/Room';
// import { RocketChatUserAdapterEE } from '../../infrastructure/rocket-chat/adapters/User';
// import {
// 	FederationBeforeAddUserToARoomDto,
// 	FederationBeforeDirectMessageRoomCreationDto,
// 	FederationCreateDirectMessageDto,
// 	FederationOnDirectMessageRoomCreationDto,
// 	FederationOnRoomCreationDto,
// 	FederationOnUsersAddedToARoomDto,
// 	FederationRoomInviteUserDto,
// 	FederationSetupRoomDto,
// } from '../input/RoomSenderDto';

// export class FederationRoomServiceSenderEE extends FederationService {
// 	constructor(
// 		protected rocketRoomAdapter: RocketChatRoomAdapterEE,
// 		protected rocketUserAdapter: RocketChatUserAdapterEE,
// 		protected rocketSettingsAdapter: RocketChatSettingsAdapter,
// 		protected rocketNotificationAdapter: RocketChatNotificationAdapter,
// 		protected bridge: IFederationBridgeEE,
// 	) {
// 		super(bridge, rocketUserAdapter, rocketSettingsAdapter);
// 	}

// 	public async onRoomCreated(roomOnCreationInput: FederationOnRoomCreationDto): Promise<void> {
// 		const { internalInviterId, internalRoomId, invitees } = roomOnCreationInput;
// 		await this.setupFederatedRoom({ internalInviterId, internalRoomId });

// 		if (invitees.length === 0) {
// 			return;
// 		}
// 		await Promise.all(
// 			invitees.map((member) =>
// 				this.inviteUserToAFederatedRoomWhenCreate({
// 					internalInviterId,
// 					internalRoomId,
// 					inviteeUsernameOnly: member.inviteeUsernameOnly,
// 					normalizedInviteeId: member.normalizedInviteeId,
// 					rawInviteeId: member.rawInviteeId,
// 				}),
// 			),
// 		);
// 	}

// 	public async onDirectMessageRoomCreation(dmRoomOnCreationInput: FederationOnDirectMessageRoomCreationDto): Promise<void> {
// 		const { internalRoomId, internalInviterId, invitees, externalInviterId } = dmRoomOnCreationInput;
// 		if (invitees.length === 0 || externalInviterId) {
// 			return;
// 		}
// 		await this.createExternalDirectMessageRoomAndInviteUsers({ internalInviterId, internalRoomId, invitees });
// 	}

// 	public async beforeDirectMessageRoomCreation(dmBeforeRoomCreationInput: FederationBeforeDirectMessageRoomCreationDto): Promise<void> {
// 		const { invitees = [] } = dmBeforeRoomCreationInput;

// 		if (invitees.length === 0) {
// 			return;
// 		}

// 		const externalUsersToBeCreatedLocally = invitees.filter(
// 			(invitee) => !this.bridge.isUserIdFromTheSameHomeserver(invitee.rawInviteeId, this.rocketSettingsAdapter.getHomeServerDomain()),
// 		);

// 		await Promise.all(
// 			externalUsersToBeCreatedLocally.map((invitee) =>
// 				this.rocketUserAdapter.createLocalUser(
// 					FederatedUserEE.createInstance('', {
// 						username: invitee.normalizedInviteeId,
// 						name: invitee.normalizedInviteeId,
// 						existsOnlyOnProxyServer: false,
// 					}),
// 				),
// 			),
// 		);
// 	}

// 	public async beforeAddUserToARoom(dmBeforeAddUserToARoomInput: FederationBeforeAddUserToARoomDto): Promise<void> {
// 		return this.beforeDirectMessageRoomCreation(dmBeforeAddUserToARoomInput);
// 	}

// 	public async onUsersAddedToARoom(roomOnUsersAddedToARoomInput: FederationOnUsersAddedToARoomDto): Promise<void> {
// 		const { internalInviterId, internalRoomId, invitees, externalInviterId } = roomOnUsersAddedToARoomInput;

// 		if (externalInviterId) {
// 			return;
// 		}

// 		await Promise.all(
// 			invitees.map((member) =>
// 				this.inviteUserToAFederatedRoomWhenAddUser({
// 					internalInviterId,
// 					internalRoomId,
// 					inviteeUsernameOnly: member.inviteeUsernameOnly,
// 					normalizedInviteeId: member.normalizedInviteeId,
// 					rawInviteeId: member.rawInviteeId,
// 				}),
// 			),
// 		);
// 	}

// 	public async createLocalDirectMessageRoom(dmRoomCreateInput: FederationCreateDirectMessageDto): Promise<void> {
// 		const { internalInviterId, invitees } = dmRoomCreateInput;
// 		await this.rocketRoomAdapter.createLocalDirectMessageRoom(invitees, internalInviterId);
// 	}

// 	public async setupFederatedRoom(roomInviteUserInput: FederationSetupRoomDto): Promise<void> {
// 		const { internalInviterId, internalRoomId } = roomInviteUserInput;

// 		if (!(await this.rocketUserAdapter.getFederatedUserByInternalId(internalInviterId))) {
// 			const internalUser = await this.rocketUserAdapter.getInternalUserById(internalInviterId);
// 			if (!internalUser || !internalUser.username) {
// 				throw new Error(`User with internalId ${internalInviterId} not found`);
// 			}
// 			const externalInviterId = await this.bridge.createUser(
// 				internalUser.username,
// 				internalUser.name || internalUser.username,
// 				this.rocketSettingsAdapter.getHomeServerDomain(),
// 			);
// 			const federatedInviterUser = FederatedUser.createInstance(externalInviterId, {
// 				name: internalUser.name || internalUser.username,
// 				username: internalUser.username,
// 				existsOnlyOnProxyServer: true,
// 			});
// 			await this.rocketUserAdapter.createFederatedUser(federatedInviterUser);
// 		}

// 		const federatedInviterUser = await this.rocketUserAdapter.getFederatedUserByInternalId(internalInviterId);
// 		if (!federatedInviterUser) {
// 			throw new Error(`User with internalId ${internalInviterId} not found`);
// 		}

// 		if (!(await this.rocketRoomAdapter.getFederatedRoomByInternalId(internalRoomId))) {
// 			const internalRoom = await this.rocketRoomAdapter.getInternalRoomById(internalRoomId);
// 			if (!internalRoom || !internalRoom.name) {
// 				throw new Error(`Room with internalId ${internalRoomId} not found`);
// 			}
// 			const roomName = internalRoom.fname || internalRoom.name;
// 			const externalRoomId = await this.bridge.createRoom(federatedInviterUser.externalId, internalRoom.t, roomName, internalRoom.topic);
// 			const newFederatedRoom = FederatedRoomEE.createInstanceEE(
// 				externalRoomId,
// 				externalRoomId,
// 				federatedInviterUser,
// 				internalRoom.t,
// 				roomName,
// 			);
// 			await this.rocketRoomAdapter.updateFederatedRoomByInternalRoomId(internalRoom._id, newFederatedRoom);
// 		}
// 	}

// 	public async afterRoomNameChanged(internalRoomId: string, internalRoomName: string): Promise<void> {
// 		const federatedRoom = await this.rocketRoomAdapter.getFederatedRoomByInternalId(internalRoomId);
// 		if (!federatedRoom) {
// 			return;
// 		}

// 		const federatedUser = await this.rocketUserAdapter.getFederatedUserByInternalId(federatedRoom.internalReference.u._id);
// 		if (!federatedUser) {
// 			return;
// 		}

// 		const isRoomFromTheSameHomeServer = FederatedRoomEE.isAnInternalRoom(
// 			this.bridge.extractHomeserverOrigin(federatedRoom.externalId),
// 			this.rocketSettingsAdapter.getHomeServerDomain(),
// 		);
// 		const externalRoomName = await this.bridge.getRoomName(federatedRoom.externalId, federatedUser.externalId);

// 		if(!isRoomFromTheSameHomeServer || !federatedRoom.shouldUpdateRoomName(externalRoomName || '')) {
// 			return;
// 		}

// 		// const externalRoomName = await this.bridge.getRoomName(federatedRoom.externalId, federatedUser.externalId);
// 		// if (externalRoomName === internalRoomName) {
// 		// 	return;
// 		// }
// 		await this.bridge.setRoomName(federatedRoom.externalId, federatedUser.externalId, internalRoomName);
// 	}

// 	public async afterRoomTopicChanged(internalRoomId: string, internalRoomTopic: string): Promise<void> {
// 		const federatedRoom = await this.rocketRoomAdapter.getFederatedRoomByInternalId(internalRoomId);
// 		if (!federatedRoom) {
// 			return;
// 		}

// 		const federatedUser = await this.rocketUserAdapter.getFederatedUserByInternalId(federatedRoom.internalReference.u._id);
// 		if (!federatedUser) {
// 			return;
// 		}

// 		// if (!this.bridge.isRoomFromTheSameHomeserver(federatedRoom.externalId, this.rocketSettingsAdapter.getHomeServerDomain())) {
// 		// 	return;
// 		// }
// 		const isRoomFromTheSameHomeServer = FederatedRoomEE.isAnInternalRoom(
// 			this.bridge.extractHomeserverOrigin(federatedRoom.externalId),
// 			this.rocketSettingsAdapter.getHomeServerDomain(),
// 		);
// 		const externalRoomTopic = await this.bridge.getRoomTopic(federatedRoom.externalId, federatedUser.externalId);
// 		// if (federatedRoom.isDirectMessage()) {
// 		// 	return;
// 		// }

// 		// const externalRoomTopic = await this.bridge.getRoomTopic(federatedRoom.externalId, federatedUser.externalId);
// 		// if (externalRoomTopic === internalRoomTopic) {
// 		// 	return;
// 		// }
// 		if(!isRoomFromTheSameHomeServer || !federatedRoom.shouldUpdateRoomName(externalRoomTopic || '')) {
// 			return;
// 		}
// 		await this.bridge.setRoomTopic(federatedRoom.externalId, federatedUser.externalId, internalRoomTopic);
// 	}

// 	private async createExternalDirectMessageRoomAndInviteUsers(
// 		dmRoomOnCreationInput: FederationOnDirectMessageRoomCreationDto,
// 	): Promise<void> {
// 		const { internalRoomId, internalInviterId, invitees } = dmRoomOnCreationInput;

// 		if (!(await this.rocketUserAdapter.getFederatedUserByInternalId(internalInviterId))) {
// 			const internalUser = await this.rocketUserAdapter.getInternalUserById(internalInviterId);
// 			if (!internalUser || !internalUser.username) {
// 				throw new Error(`User with internalId ${internalInviterId} not found`);
// 			}
// 			const username = internalUser.username || internalInviterId;
// 			const name = internalUser.name || internalInviterId;
// 			const externalInviterId = await this.bridge.createUser(username, name, this.rocketSettingsAdapter.getHomeServerDomain());
// 			const federatedInviterUser = FederatedUser.createInstance(externalInviterId, {
// 				name,
// 				username,
// 				existsOnlyOnProxyServer: true,
// 			});
// 			await this.rocketUserAdapter.createFederatedUser(federatedInviterUser);
// 		}
// 		const federatedInviterUser = await this.rocketUserAdapter.getFederatedUserByInternalId(internalInviterId);
// 		if (!federatedInviterUser) {
// 			throw new Error(`User with internalId ${internalInviterId} not found`);
// 		}
// 		const isInviterFromTheSameHomeServer = this.bridge.isUserIdFromTheSameHomeserver(
// 			federatedInviterUser.externalId,
// 			this.rocketSettingsAdapter.getHomeServerDomain(),
// 		);

// 		if (!(await this.rocketRoomAdapter.getFederatedRoomByInternalId(internalRoomId)) && isInviterFromTheSameHomeServer) {
// 			const externalRoomId = await this.bridge.createDirectMessageRoom(
// 				federatedInviterUser.externalId,
// 				invitees.map((invitee) => invitee.rawInviteeId),
// 			);
// 			const newFederatedRoom = FederatedRoomEE.createInstanceEE(
// 				externalRoomId,
// 				externalRoomId,
// 				federatedInviterUser,
// 				RoomType.DIRECT_MESSAGE,
// 				'',
// 			);
// 			await this.rocketRoomAdapter.updateFederatedRoomByInternalRoomId(internalRoomId, newFederatedRoom);
// 		}

// 		await Promise.all(
// 			invitees.map((member) =>
// 				this.createUserForDirectMessage({
// 					internalInviterId,
// 					internalRoomId,
// 					inviteeUsernameOnly: member.inviteeUsernameOnly,
// 					normalizedInviteeId: member.normalizedInviteeId,
// 					rawInviteeId: member.rawInviteeId,
// 				}),
// 			),
// 		);
// 	}

// 	private async createUserForDirectMessage(roomInviteUserInput: FederationRoomInviteUserDto): Promise<void> {
// 		const { normalizedInviteeId, inviteeUsernameOnly, rawInviteeId } = roomInviteUserInput;
// 		const isInviteeFromTheSameHomeServer = this.bridge.isUserIdFromTheSameHomeserver(
// 			rawInviteeId,
// 			this.rocketSettingsAdapter.getHomeServerDomain(),
// 		);

// 		if (isInviteeFromTheSameHomeServer) {
// 			const existsOnlyOnProxyServer = true;

// 			await this.createFederatedUserIfNecessary(inviteeUsernameOnly, rawInviteeId, existsOnlyOnProxyServer);

// 			const federatedInviteeUser = await this.rocketUserAdapter.getFederatedUserByInternalUsername(inviteeUsernameOnly);
// 			if (!federatedInviteeUser) {
// 				throw new Error(`User with internalUsername ${inviteeUsernameOnly} not found`);
// 			}

// 			await this.bridge.createUser(
// 				inviteeUsernameOnly,
// 				federatedInviteeUser?.internalReference?.name || federatedInviteeUser.internalReference?.username || inviteeUsernameOnly,
// 				this.rocketSettingsAdapter.getHomeServerDomain(),
// 			);
// 			return;
// 		}

// 		const existsOnlyOnProxyServer = false;

// 		await this.createFederatedUserIfNecessary(normalizedInviteeId, rawInviteeId, existsOnlyOnProxyServer);
// 	}

// 	private async inviteUserToAFederatedRoomWhenCreate(roomInviteUserInput: FederationRoomInviteUserDto): Promise<void> {
// 		const { internalInviterId, internalRoomId, normalizedInviteeId, inviteeUsernameOnly, rawInviteeId } = roomInviteUserInput;
// 		const isInviteeFromTheSameHomeServer = this.bridge.isUserIdFromTheSameHomeserver(
// 			rawInviteeId,
// 			this.rocketSettingsAdapter.getHomeServerDomain(),
// 		);
// 		const federatedRoom = await this.rocketRoomAdapter.getFederatedRoomByInternalId(internalRoomId);
// 		if (!federatedRoom) {
// 			throw new Error(`Could not find the room to invite. RoomId: ${internalRoomId}`);
// 		}
// 		const federatedInviterUser = await this.rocketUserAdapter.getFederatedUserByInternalId(internalInviterId);
// 		if (!federatedInviterUser) {
// 			throw new Error(`User with internalId ${internalInviterId} not found`);
// 		}
// 		if (isInviteeFromTheSameHomeServer) {
// 			const existsOnlyOnProxyServer = true;

// 			await this.createFederatedUserIfNecessary(inviteeUsernameOnly, rawInviteeId, existsOnlyOnProxyServer);

// 			const federatedInviteeUser = await this.rocketUserAdapter.getFederatedUserByInternalUsername(inviteeUsernameOnly);
// 			if (!federatedInviteeUser) {
// 				throw new Error(`User with internalUsername ${inviteeUsernameOnly} not found`);
// 			}
// 			if (await this.rocketRoomAdapter.isUserAlreadyJoined(internalRoomId, federatedInviteeUser.internalReference._id)) {
// 				return;
// 			}
// 			await this.rocketRoomAdapter.addUserToRoom(federatedRoom, federatedInviteeUser, federatedInviterUser);
// 			await this.bridge.inviteToRoom(federatedRoom.externalId, federatedInviterUser.externalId, rawInviteeId);
// 			return;
// 		}

// 		const existsOnlyOnProxyServer = false;

// 		await this.createFederatedUserIfNecessary(normalizedInviteeId, rawInviteeId, existsOnlyOnProxyServer);

// 		const federatedInviteeUser = await this.rocketUserAdapter.getFederatedUserByInternalUsername(normalizedInviteeId);
// 		if (!federatedInviteeUser) {
// 			throw new Error(`User with internalUsername ${normalizedInviteeId} not found`);
// 		}

// 		if (await this.rocketRoomAdapter.isUserAlreadyJoined(internalRoomId, federatedInviteeUser.internalReference._id)) {
// 			return;
// 		}

// 		await this.bridge
// 			.inviteToRoom(federatedRoom.externalId, federatedInviterUser.externalId, federatedInviteeUser?.externalId)
// 			.catch(() => {
// 				this.rocketNotificationAdapter.notifyWithEphemeralMessage(
// 					'Federation_Matrix_only_owners_can_invite_users',
// 					federatedInviterUser?.internalReference?._id,
// 					internalRoomId,
// 					federatedInviterUser?.internalReference?.language,
// 				);
// 			});
// 	}

// 	private async inviteUserToAFederatedRoomWhenAddUser(roomInviteUserInput: FederationRoomInviteUserDto): Promise<void> {
// 		const { internalInviterId, internalRoomId, normalizedInviteeId, inviteeUsernameOnly, rawInviteeId } = roomInviteUserInput;
// 		const isInviteeFromTheSameHomeServer = this.bridge.isUserIdFromTheSameHomeserver(
// 			rawInviteeId,
// 			this.rocketSettingsAdapter.getHomeServerDomain(),
// 		);
// 		const federatedRoom = await this.rocketRoomAdapter.getFederatedRoomByInternalId(internalRoomId);
// 		if (!federatedRoom) {
// 			throw new Error(`Could not find the room to invite. RoomId: ${internalRoomId}`);
// 		}
// 		const federatedInviterUser = await this.rocketUserAdapter.getFederatedUserByInternalId(internalInviterId);
// 		if (!federatedInviterUser) {
// 			throw new Error(`User with internalId ${internalInviterId} not found`);
// 		}

// 		if (isInviteeFromTheSameHomeServer) {
// 			const existsOnlyOnProxyServer = true;

// 			await this.createFederatedUserIfNecessary(inviteeUsernameOnly, rawInviteeId, existsOnlyOnProxyServer);

// 			const federatedInviteeUser = await this.rocketUserAdapter.getFederatedUserByInternalUsername(inviteeUsernameOnly);
// 			if (!federatedInviteeUser) {
// 				throw new Error(`User with internalUsername ${inviteeUsernameOnly} not found`);
// 			}
// 			await this.bridge.createUser(
// 				inviteeUsernameOnly,
// 				federatedInviteeUser?.internalReference?.name || federatedInviteeUser.internalReference?.username || inviteeUsernameOnly,
// 				this.rocketSettingsAdapter.getHomeServerDomain(),
// 			);
// 			await this.bridge.inviteToRoom(federatedRoom.externalId, federatedInviterUser.externalId, federatedInviteeUser.externalId);
// 			await this.rocketRoomAdapter.addUserToRoom(federatedRoom, federatedInviteeUser, federatedInviterUser);

// 			return;
// 		}

// 		const existsOnlyOnProxyServer = false;

// 		await this.createFederatedUserIfNecessary(normalizedInviteeId, rawInviteeId, existsOnlyOnProxyServer);

// 		const federatedInviteeUser = await this.rocketUserAdapter.getFederatedUserByInternalUsername(normalizedInviteeId);
// 		if (!federatedInviteeUser) {
// 			throw new Error(`User with internalUsername ${normalizedInviteeId} not found`);
// 		}
// 		await this.bridge
// 			.inviteToRoom(federatedRoom.externalId, federatedInviterUser.externalId, federatedInviteeUser?.externalId)
// 			.catch(() => {
// 				this.rocketNotificationAdapter.notifyWithEphemeralMessage(
// 					'Federation_Matrix_only_owners_can_invite_users',
// 					federatedInviterUser?.internalReference?._id,
// 					internalRoomId,
// 					federatedInviterUser?.internalReference?.language,
// 				);
// 			});
// 	}

// 	private async createFederatedUserIfNecessary(username: string, rawUsername: string, existsOnlyOnProxyServer = false): Promise<void> {
// 		if (!(await this.rocketUserAdapter.getFederatedUserByInternalUsername(username))) {
// 			const externalUserProfileInformation = await this.bridge.getUserProfileInformation(rawUsername);
// 			const name = externalUserProfileInformation?.displayName || username;
// 			const newFederatedInviteeUser = FederatedUser.createInstance(rawUsername, {
// 				name,
// 				username,
// 				existsOnlyOnProxyServer,
// 			});

// 			await this.rocketUserAdapter.createFederatedUser(newFederatedInviteeUser);
// 		}
// 	}
// }
