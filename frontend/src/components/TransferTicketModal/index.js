import React, { useState, useEffect, useContext } from "react";
import { useHistory } from "react-router-dom";

import Button from "@material-ui/core/Button";
import TextField from "@material-ui/core/TextField";
import Dialog from "@material-ui/core/Dialog";
import Select from "@material-ui/core/Select";
import FormControl from "@material-ui/core/FormControl";
import InputLabel from "@material-ui/core/InputLabel";
import MenuItem from "@material-ui/core/MenuItem";
import { makeStyles } from "@material-ui/core";

import DialogActions from "@material-ui/core/DialogActions";
import DialogContent from "@material-ui/core/DialogContent";
import DialogTitle from "@material-ui/core/DialogTitle";
import Autocomplete, {
	createFilterOptions,
} from "@material-ui/lab/Autocomplete";
import CircularProgress from "@material-ui/core/CircularProgress";

import { i18n } from "../../translate/i18n";
import api from "../../services/api";
import ButtonWithSpinner from "../ButtonWithSpinner";
import toastError from "../../errors/toastError";
import useQueues from "../../hooks/useQueues";
import useWhatsApps from "../../hooks/useWhatsApps";
import { AuthContext } from "../../context/Auth/AuthContext";
import { Can } from "../Can";

const useStyles = makeStyles((theme) => ({
  maxWidth: {
    width: "100%",
  },
}));

const filterOptions = createFilterOptions({
	trim: true,
});

const TransferTicketModal = ({ modalOpen, onClose, ticketid, ticketWhatsappId }) => {
	const history = useHistory();
	const [options, setOptions] = useState([]);
	const [allQueues, setAllQueues] = useState([]);
	const [loading, setLoading] = useState(false);
	const [searchParam, setSearchParam] = useState("");
	const [selectedUser, setSelectedUser] = useState(null);
	const [selectedQueue, setSelectedQueue] = useState('');
	const [selectedWhatsapp, setSelectedWhatsapp] = useState(ticketWhatsappId);
	const classes = useStyles();
	const { findAll: findAllQueues } = useQueues();
	const { loadingWhatsapps, whatsApps } = useWhatsApps();

	const { user: loggedInUser } = useContext(AuthContext);

	useEffect(() => {
		const loadQueues = async () => {
			const list = await findAllQueues();
			setAllQueues(list);
		}
		loadQueues();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	useEffect(() => {
		if (!modalOpen || !selectedQueue) {
			setOptions([]);
			setLoading(false);
			return;
		}

		let active = true;
		setLoading(true);
		const delayDebounceFn = setTimeout(() => {
			const fetchUsers = async () => {
				try {
					const { data } = await api.get("/users/", {
						params: { searchParam, queueId: selectedQueue },
					});
					if (active) {
						setOptions(data.users);
						setLoading(false);
					}
				} catch (err) {
					if (active) {
						setLoading(false);
						toastError(err);
					}
				}
			};

			fetchUsers();
		}, 500);
		return () => {
			active = false;
			clearTimeout(delayDebounceFn);
		};
	}, [searchParam, modalOpen, selectedQueue]);

	const handleQueueChange = e => {
		setSelectedQueue(e.target.value);
		setSelectedUser(null);
		setOptions([]);
		setSearchParam("");
	};

	const handleClose = () => {
		onClose();
		setSearchParam("");
		setSelectedUser(null);
		setSelectedQueue("");
		setOptions([]);
		setSelectedWhatsapp(ticketWhatsappId);
	};

	const handleSaveTicket = async e => {
		e.preventDefault();
		if (!ticketid || !selectedQueue) return;
		setLoading(true);
		try {
			const data = {
				operation: "transfer",
				queueId: selectedQueue,
				userId: selectedUser?.id || null,
			};

			if(selectedWhatsapp) {
				data.whatsappId = selectedWhatsapp;
			}

			await api.put(`/tickets/${ticketid}`, data);

			setLoading(false);
			history.push(`/tickets`);
		} catch (err) {
			setLoading(false);
			toastError(err);
		}
	};

	return (
		<Dialog open={modalOpen} onClose={handleClose} maxWidth="lg" scroll="paper">
			<form onSubmit={handleSaveTicket}>
				<DialogTitle id="form-dialog-title">
					{i18n.t("transferTicketModal.title")}
				</DialogTitle>
				<DialogContent dividers>
					<FormControl variant="outlined" className={classes.maxWidth}>
						<InputLabel>{i18n.t("transferTicketModal.fieldQueueLabel")}</InputLabel>
						<Select
							value={selectedQueue}
							onChange={handleQueueChange}
							label={i18n.t("transferTicketModal.fieldQueuePlaceholder")}
							required
						>
							<MenuItem value={''}>&nbsp;</MenuItem>
							{allQueues.map((queue) => (
								<MenuItem key={queue.id} value={queue.id}>{queue.name}</MenuItem>
							))}
						</Select>
					</FormControl>
					<Autocomplete
						style={{ width: 300, marginTop: 20 }}
						value={selectedUser}
						inputValue={searchParam}
						getOptionLabel={option => `${option.name}`}
						onChange={(e, newValue) => setSelectedUser(newValue)}
						onInputChange={(e, newValue) => setSearchParam(newValue)}
						options={options}
						filterOptions={filterOptions}
						autoHighlight
						disabled={!selectedQueue}
						noOptionsText={i18n.t("transferTicketModal.noOptions")}
						loading={loading}
						renderInput={params => (
							<TextField
								{...params}
								label={i18n.t("transferTicketModal.fieldLabel")}
								variant="outlined"
								InputProps={{
									...params.InputProps,
									endAdornment: (
										<React.Fragment>
											{loading ? (
												<CircularProgress color="inherit" size={20} />
											) : null}
											{params.InputProps.endAdornment}
										</React.Fragment>
									),
								}}
							/>
						)}
					/>
					<Can
						role={loggedInUser.profile}
						perform="ticket-options:transferWhatsapp"
						yes={() => (!loadingWhatsapps && 
							<FormControl variant="outlined" className={classes.maxWidth} style={{ marginTop: 20 }}>
								<InputLabel>{i18n.t("transferTicketModal.fieldConnectionLabel")}</InputLabel>
								<Select
									value={selectedWhatsapp}
									onChange={(e) => setSelectedWhatsapp(e.target.value)}
									label={i18n.t("transferTicketModal.fieldConnectionPlaceholder")}
								>
									{whatsApps.map((whasapp) => (
										<MenuItem key={whasapp.id} value={whasapp.id}>{whasapp.name}</MenuItem>
									))}
								</Select>
							</FormControl>
						)}
					/>
				</DialogContent>
				<DialogActions>
					<Button
						onClick={handleClose}
						color="secondary"
						disabled={loading}
						variant="outlined"
					>
						{i18n.t("transferTicketModal.buttons.cancel")}
					</Button>
					<ButtonWithSpinner
						variant="contained"
						type="submit"
						color="primary"
						loading={loading}
						disabled={!selectedQueue || loading}
					>
						{i18n.t("transferTicketModal.buttons.ok")}
					</ButtonWithSpinner>
				</DialogActions>
			</form>
		</Dialog>
	);
};

export default TransferTicketModal;
