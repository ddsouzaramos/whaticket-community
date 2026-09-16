import openSocket from "socket.io-client";
import { getBackendUrl } from "../config";
import {
	getAccessToken,
	getTransientRetryDelay,
	hasRefreshableSession,
	isDefinitiveRefreshError,
	refreshAccessToken,
} from "./auth-token";

const AUTH_RECOVERY_DELAYS = [2000, 5000];

function connectToSocket() {
	const provideAuth = callback => {
		callback({ token: getAccessToken() });
	};
	const socket = openSocket(getBackendUrl(), {
		transports: ["websocket", "polling", "flashsocket"],
		auth: provideAuth,
		autoConnect: hasRefreshableSession(),
	});
	const originalDisconnect = socket.disconnect.bind(socket);
	let discarded = false;
	let recoveryAttempts = 0;
	let recoveryInProgress = false;
	let recoveryTimer = null;

	const clearRecoveryTimer = () => {
		if (recoveryTimer) {
			clearTimeout(recoveryTimer);
			recoveryTimer = null;
		}
	};

	const dispose = () => {
		discarded = true;
		clearRecoveryTimer();
	};

	socket.disconnect = () => {
		dispose();
		return originalDisconnect();
	};

	const recoverAuthentication = async () => {
		if (
			discarded ||
			recoveryInProgress ||
			recoveryAttempts > AUTH_RECOVERY_DELAYS.length ||
			!hasRefreshableSession()
		) {
			return;
		}

		recoveryInProgress = true;
		recoveryAttempts += 1;

		try {
			await refreshAccessToken();

			if (discarded || !hasRefreshableSession()) {
				return;
			}

			socket.auth = provideAuth;
			socket.connect();
		} catch (error) {
			if (
				discarded ||
				isDefinitiveRefreshError(error) ||
				recoveryAttempts > AUTH_RECOVERY_DELAYS.length
			) {
				return;
			}

			const configuredDelay = AUTH_RECOVERY_DELAYS[recoveryAttempts - 1];
			const retryDelay = Math.max(
				configuredDelay,
				getTransientRetryDelay(error)
			);

			recoveryTimer = setTimeout(() => {
				recoveryTimer = null;
				recoverAuthentication();
			}, retryDelay);
		} finally {
			recoveryInProgress = false;
		}
	};

	socket.on("connect", () => {
		recoveryAttempts = 0;
		clearRecoveryTimer();
	});

	socket.on("connect_error", error => {
		if (
			error?.data?.code !== "SOCKET_AUTH_ERROR" ||
			discarded ||
			recoveryInProgress ||
			recoveryTimer
		) {
			return;
		}

		recoverAuthentication();
	});

	return socket;
}

export default connectToSocket;
