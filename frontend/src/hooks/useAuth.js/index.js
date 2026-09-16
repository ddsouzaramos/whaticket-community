import { useState, useEffect } from "react";
import { useHistory } from "react-router-dom";
import openSocket from "../../services/socket-io";

import { toast } from "react-toastify";

import { i18n } from "../../translate/i18n";
import api from "../../services/api";
import {
	endSession,
	getAccessToken,
	refreshAccessToken,
	startSession,
	subscribeSessionState,
	waitForRefreshCompletion,
} from "../../services/auth-token";
import toastError from "../../errors/toastError";

const useAuth = () => {
	const history = useHistory();
	const [isAuth, setIsAuth] = useState(false);
	const [loading, setLoading] = useState(true);
	const [user, setUser] = useState({});

	useEffect(() => {
		return subscribeSessionState(state => {
			if (state === "ended") {
				setIsAuth(false);
			}
		});
	}, []);

	useEffect(() => {
		const token = getAccessToken();
		(async () => {
			if (token) {
				try {
					const data = await refreshAccessToken();
					setIsAuth(true);
					setUser(data.user);
				} catch (err) {
					toastError(err);
				}
			}
			setLoading(false);
		})();
	}, []);

	useEffect(() => {
		if (!getAccessToken()) {
			return undefined;
		}

		const socket = openSocket();

		socket.on("user", data => {
			if (data.action === "update" && data.user.id === user.id) {
				setUser(data.user);
			}
		});

		return () => {
			socket.disconnect();
		};
	}, [user]);

	const handleLogin = async userData => {
		setLoading(true);

		try {
			await waitForRefreshCompletion();
			const { data } = await api.post("/auth/login", userData);
			startSession(data.token);
			setUser(data.user);
			setIsAuth(true);
			toast.success(i18n.t("auth.toasts.success"));
			history.push("/tickets");
			setLoading(false);
		} catch (err) {
			toastError(err);
			setLoading(false);
		}
	};

	const handleLogout = async () => {
		setLoading(true);
		endSession();

		setIsAuth(false);
		setUser({});

		try {
			await waitForRefreshCompletion();
			await api.delete("/auth/logout");
		} catch (err) {
			toastError(err);
		} finally {
			setLoading(false);
			history.push("/login");
		}
	};

	return { isAuth, user, loading, handleLogin, handleLogout };
};

export default useAuth;
