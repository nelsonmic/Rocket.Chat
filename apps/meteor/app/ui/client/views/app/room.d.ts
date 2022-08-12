import type { IRoom } from '@rocket.chat/core-typings';

import type { ChatMessages } from '../../lib/chatMessages';

export const chatMessages: Record<IRoom['_id'], ChatMessages>;

export const dropzoneEvents: {
	'dragenter .dropzone': (e: Event) => void;
	'dragleave .dropzone-overlay': (e: Event) => void;
	'dragover .dropzone-overlay': (e: Event) => void;
	'dropped .dropzone-overlay': (e: Event, t: Blaze.TemplateInstance) => void;
};
