import type { IRoom } from '@rocket.chat/core-typings';

import { hasPermissionAsync, hasAtLeastOnePermissionAsync } from '../../../authorization/server/functions/hasPermission';
import { Rooms } from '../../../models/server/raw';
import { Subscriptions } from '../../../models/server';
import { adminFields } from '../../../../lib/rooms/adminFields';

// TO-DO: use PaginatedRequest and PaginatedResult
export async function findAdminRooms({
	uid,
	filter,
	types = [],
	pagination: { offset, count, sort },
}: {
	uid: string;
	filter: string;
	types: string[];
	pagination: { offset: number; count: number; sort: number };
}): Promise<{
	rooms: IRoom[];
	count: number;
	offset: number;
	total: number;
}> {
	if (!(await hasPermissionAsync(uid, 'view-room-administration'))) {
		throw new Error('error-not-authorized');
	}
	const name = filter?.trim();
	const discussion = types?.includes('discussions');
	const includeTeams = types?.includes('teams');
	const showOnlyTeams = types.length === 1 && types.includes('teams');
	const typesToRemove = ['discussions', 'teams'];
	const showTypes = Array.isArray(types) ? types.filter((type) => !typesToRemove.includes(type)) : [];
	const options = {
		fields: adminFields,
		sort: sort || { default: -1, name: 1 },
		skip: offset,
		limit: count,
	};

	let cursor;
	if (name && showTypes.length) {
		cursor = Rooms.findByNameContainingAndTypes(name, showTypes, discussion, includeTeams, showOnlyTeams, options);
	} else if (showTypes.length) {
		cursor = Rooms.findByTypes(showTypes, discussion, includeTeams, showOnlyTeams, options);
	} else {
		cursor = Rooms.findByNameContaining(name, discussion, includeTeams, showOnlyTeams, options);
	}

	const total = await cursor.count();

	const rooms = await cursor.toArray();

	return {
		rooms,
		count: rooms.length,
		offset,
		total,
	};
}

export async function findAdminRoom({ uid, rid }: { uid: string; rid: string }): Promise<unknown> {
	if (!(await hasPermissionAsync(uid, 'view-room-administration'))) {
		throw new Error('error-not-authorized');
	}

	return Rooms.findOneById(rid, { fields: adminFields });
}

export async function findChannelAndPrivateAutocomplete({ uid, selector }: { uid: string; selector: { name: string } }): Promise<{
	items: IRoom[];
}> {
	const options = {
		fields: {
			_id: 1,
			fname: 1,
			name: 1,
			t: 1,
			avatarETag: 1,
		},
		limit: 10,
		sort: {
			name: 1,
		},
	};

	const userRoomsIds = Subscriptions.cachedFindByUserId(uid, { fields: { rid: 1 } })
		.fetch()
		.map((item: IRoom) => item._id);

	const rooms = await Rooms.findRoomsWithoutDiscussionsByRoomIds(selector.name, userRoomsIds, options).toArray();

	return {
		items: rooms,
	};
}

export async function findAdminRoomsAutocomplete({ uid, selector }: { uid: string; selector: { name: string } }): Promise<{
	items: IRoom[];
}> {
	if (!(await hasAtLeastOnePermissionAsync(uid, ['view-room-administration', 'can-audit']))) {
		throw new Error('error-not-authorized');
	}
	const options = {
		fields: {
			_id: 1,
			fname: 1,
			name: 1,
			t: 1,
			avatarETag: 1,
		},
		limit: 10,
		sort: {
			name: 1,
		},
	};

	const rooms = await Rooms.findRoomsByNameOrFnameStarting(selector.name, options).toArray();

	return {
		items: rooms,
	};
}

export async function findChannelAndPrivateAutocompleteWithPagination({
	uid,
	selector,
	pagination: { offset, count, sort },
}: {
	uid: string;
	selector: { name: string };
	pagination: { offset: number; count: number; sort: number };
}): Promise<{
	items: IRoom[];
	total: number;
}> {
	const userRoomsIds = Subscriptions.cachedFindByUserId(uid, { fields: { rid: 1 } })
		.fetch()
		.map((item: IRoom) => item._id);

	const options = {
		fields: {
			_id: 1,
			fname: 1,
			name: 1,
			t: 1,
			avatarETag: 1,
		},
		sort: sort || { name: 1 },
		skip: offset,
		limit: count,
	};

	const cursor = await Rooms.findRoomsWithoutDiscussionsByRoomIds(selector.name, userRoomsIds, options);

	const total = await cursor.count();
	const rooms = await cursor.toArray();

	return {
		items: rooms,
		total,
	};
}

export async function findRoomsAvailableForTeams({ uid, name }: { uid: string; name: string }): Promise<{
	items: IRoom[];
}> {
	const options = {
		fields: {
			_id: 1,
			fname: 1,
			name: 1,
			t: 1,
			avatarETag: 1,
		},
		limit: 10,
		sort: {
			name: 1,
		},
	};

	const userRooms = Subscriptions.findByUserIdAndRoles(uid, ['owner'], { fields: { rid: 1 } })
		.fetch()
		.map((item: IRoom) => item._id);

	const rooms = await Rooms.findChannelAndGroupListWithoutTeamsByNameStartingByOwner(uid, name, userRooms, options).toArray();

	return {
		items: rooms,
	};
}