import axios from "axios";
import api from "./api";

const TOKEN_STORAGE_KEY = "token";
const TRANSIENT_REFRESH_COOLDOWN = 2000;
const REFRESH_WAIT_TIMEOUT = 3000;

const SESSION_STATE = {
	ACTIVE: "active",
	REFRESHING: "refreshing",
	TRANSIENT_ERROR: "transient-error",
	ENDED: "ended",
};

let refreshPromise = null;
let refreshCancelSource = null;
let sessionEpoch = 0;
let transientRetryAfter = 0;
const sessionStateListeners = new Set();

export const getAccessToken = () => {
	const storedToken = localStorage.getItem(TOKEN_STORAGE_KEY);

	if (!storedToken) {
		return null;
	}

	try {
		return JSON.parse(storedToken);
	} catch (err) {
		return null;
	}
};

let sessionState = getAccessToken()
	? SESSION_STATE.ACTIVE
	: SESSION_STATE.ENDED;

const notifySessionState = () => {
	sessionStateListeners.forEach(listener => listener(sessionState));
};

const updateSessionState = state => {
	sessionState = state;
	notifySessionState();
};

export const setAccessToken = token => {
	if (!token) {
		localStorage.removeItem(TOKEN_STORAGE_KEY);
		api.defaults.headers.Authorization = undefined;
		return;
	}

	localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(token));
	api.defaults.headers.Authorization = `Bearer ${token}`;
};

export const clearAccessToken = () => setAccessToken(null);

export const startSession = token => {
	sessionEpoch += 1;
	transientRetryAfter = 0;
	setAccessToken(token);
	updateSessionState(SESSION_STATE.ACTIVE);
};

export const endSession = () => {
	const accessToken = getAccessToken();

	if (sessionState !== SESSION_STATE.ENDED) {
		sessionEpoch += 1;
	}

	transientRetryAfter = 0;
	clearAccessToken();
	updateSessionState(SESSION_STATE.ENDED);

	return accessToken;
};

export const subscribeSessionState = listener => {
	sessionStateListeners.add(listener);
	return () => sessionStateListeners.delete(listener);
};

export const hasRefreshableSession = () =>
	sessionState !== SESSION_STATE.ENDED && Boolean(getAccessToken());

const createSessionError = (code, retryAfter = 0) => {
	const error = new Error(code);
	error.code = code;
	error.retryAfter = retryAfter;
	return error;
};

export const isDefinitiveRefreshError = error => {
	if (
		error?.code === "AUTH_SESSION_ENDED" ||
		error?.code === "AUTH_REFRESH_CANCELLED"
	) {
		return true;
	}

	const status = error?.response?.status;
	return Boolean(
		status &&
			status >= 400 &&
			status < 500 &&
			status !== 408 &&
			status !== 429
	);
};

export const getTransientRetryDelay = error => {
	if (error?.code === "AUTH_REFRESH_COOLDOWN") {
		return error.retryAfter;
	}

	return Math.max(0, transientRetryAfter - Date.now());
};

export const waitForRefreshCompletion = async () => {
	const pendingRefresh = refreshPromise;

	if (!pendingRefresh) {
		return;
	}

	let timeoutId;
	const timeoutPromise = new Promise(resolve => {
		timeoutId = setTimeout(() => {
			if (refreshPromise === pendingRefresh && refreshCancelSource) {
				refreshCancelSource.cancel("AUTH_REFRESH_WAIT_TIMEOUT");
			}
			resolve();
		}, REFRESH_WAIT_TIMEOUT);
	});

	try {
		await Promise.race([
			pendingRefresh.catch(() => undefined),
			timeoutPromise,
		]);
	} finally {
		clearTimeout(timeoutId);
		// The caller only needs to wait until the previous refresh settles.
	}
};

export const refreshAccessToken = () => {
	if (refreshPromise) {
		return refreshPromise;
	}

	if (!hasRefreshableSession()) {
		return Promise.reject(createSessionError("AUTH_SESSION_ENDED"));
	}

	const now = Date.now();
	if (transientRetryAfter > now) {
		return Promise.reject(
			createSessionError(
				"AUTH_REFRESH_COOLDOWN",
				transientRetryAfter - now
			)
		);
	}

	const refreshEpoch = sessionEpoch;
	updateSessionState(SESSION_STATE.REFRESHING);
	const currentRefreshCancelSource = axios.CancelToken.source();

	let currentRefreshPromise;
	currentRefreshPromise = api
		.post("/auth/refresh_token", undefined, {
			cancelToken: currentRefreshCancelSource.token,
		})
		.then(({ data }) => {
			if (
				refreshEpoch !== sessionEpoch ||
				sessionState === SESSION_STATE.ENDED
			) {
				throw createSessionError("AUTH_REFRESH_CANCELLED");
			}

			transientRetryAfter = 0;
			setAccessToken(data.token);
			updateSessionState(SESSION_STATE.ACTIVE);
			return data;
		})
		.catch(error => {
			if (refreshEpoch !== sessionEpoch) {
				throw createSessionError("AUTH_REFRESH_CANCELLED");
			}

			if (isDefinitiveRefreshError(error)) {
				endSession();
			} else {
				transientRetryAfter = Date.now() + TRANSIENT_REFRESH_COOLDOWN;
				updateSessionState(SESSION_STATE.TRANSIENT_ERROR);
			}

			throw error;
		})
		.finally(() => {
			if (refreshPromise === currentRefreshPromise) {
				refreshPromise = null;
			}
			if (refreshCancelSource === currentRefreshCancelSource) {
				refreshCancelSource = null;
			}
		});

	refreshPromise = currentRefreshPromise;
	refreshCancelSource = currentRefreshCancelSource;
	return refreshPromise;
};

const initialToken = getAccessToken();
if (initialToken) {
	setAccessToken(initialToken);
}

api.interceptors.request.use(
	config => {
		const token = getAccessToken();
		if (token) {
			config.headers["Authorization"] = `Bearer ${token}`;
		}
		return config;
	},
	error => Promise.reject(error)
);

api.interceptors.response.use(
	response => response,
	async error => {
		const originalRequest = error.config;
		const isRefreshRequest = originalRequest?.url?.includes(
			"/auth/refresh_token"
		);

		if (
			error?.response?.status === 403 &&
			originalRequest &&
			!originalRequest._retry &&
			!isRefreshRequest &&
			hasRefreshableSession()
		) {
			originalRequest._retry = true;
			await refreshAccessToken();
			return api(originalRequest);
		}

		if (error?.response?.status === 401 && !isRefreshRequest) {
			endSession();
		}

		return Promise.reject(error);
	}
);
