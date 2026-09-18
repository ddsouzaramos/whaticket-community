import React, { useEffect, useRef, useState } from "react";

import {
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  List,
  ListItem,
  ListItemText,
  makeStyles,
  TextField,
  Typography,
} from "@material-ui/core";
import { toast } from "react-toastify";

import { i18n } from "../../translate/i18n";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import ButtonWithSpinner from "../ButtonWithSpinner";

const useStyles = makeStyles(theme => ({
  content: {
    minWidth: 360,
    [theme.breakpoints.down("xs")]: {
      minWidth: "auto",
    },
  },
  results: {
    marginTop: theme.spacing(1),
    minHeight: 120,
    maxHeight: 360,
    overflowY: "auto",
  },
  state: {
    minHeight: 120,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
  },
}));

const ForwardMessageModal = ({
  open,
  onClose,
  messageId,
  sourceTicketId,
}) => {
  const classes = useStyles();
  const [searchParam, setSearchParam] = useState("");
  const [targets, setTargets] = useState([]);
  const [selectedTicketId, setSelectedTicketId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const requestSequence = useRef(0);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (!open || !messageId) return undefined;

    const sequence = requestSequence.current + 1;
    requestSequence.current = sequence;
    let active = true;

    setLoading(true);
    setLoadError(false);
    setSelectedTicketId(null);

    const debounceTimer = setTimeout(async () => {
      try {
        const { data } = await api.get(
          `/messages/${messageId}/forward-targets`,
          {
            params: { searchParam, pageNumber: 1 },
          }
        );

        if (active && requestSequence.current === sequence) {
          setTargets(
            data.targets.filter(
              target => Number(target.ticketId) !== Number(sourceTicketId)
            )
          );
          setLoading(false);
        }
      } catch (err) {
        if (active && requestSequence.current === sequence) {
          setTargets([]);
          setLoading(false);
          setLoadError(true);
          toastError(err);
        }
      }
    }, 400);

    return () => {
      active = false;
      clearTimeout(debounceTimer);
    };
  }, [messageId, open, searchParam, sourceTicketId]);

  const resetState = () => {
    requestSequence.current += 1;
    submittingRef.current = false;
    setSearchParam("");
    setTargets([]);
    setSelectedTicketId(null);
    setLoading(false);
    setLoadError(false);
    setSubmitting(false);
  };

  const handleClose = () => {
    if (submittingRef.current) return;
    resetState();
    onClose();
  };

  const handleForward = async () => {
    if (!selectedTicketId || submittingRef.current) return;

    submittingRef.current = true;
    setSubmitting(true);

    try {
      await api.post(`/messages/${messageId}/forward`, {
        destinationTicketId: selectedTicketId,
      });

      toast.success(i18n.t("forwardMessageModal.success"));
      resetState();
      onClose();
    } catch (err) {
      submittingRef.current = false;
      setSubmitting(false);
      toastError(err);
    }
  };

  const getStatusLabel = status =>
    i18n.t(`forwardMessageModal.status.${status}`, {
      defaultValue: status,
    });

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>{i18n.t("forwardMessageModal.title")}</DialogTitle>
      <DialogContent dividers className={classes.content}>
        <TextField
          value={searchParam}
          onChange={event => setSearchParam(event.target.value)}
          label={i18n.t("forwardMessageModal.searchPlaceholder")}
          variant="outlined"
          fullWidth
          autoFocus
          disabled={submitting}
          inputProps={{ "aria-label": i18n.t("forwardMessageModal.searchPlaceholder") }}
        />

        <div className={classes.results}>
          {loading && (
            <div className={classes.state}>
              <CircularProgress size={28} />
            </div>
          )}

          {!loading && loadError && (
            <Typography color="error" className={classes.state}>
              {i18n.t("forwardMessageModal.loadError")}
            </Typography>
          )}

          {!loading && !loadError && targets.length === 0 && (
            <Typography color="textSecondary" className={classes.state}>
              {i18n.t("forwardMessageModal.noTargets")}
            </Typography>
          )}

          {!loading && !loadError && targets.length > 0 && (
            <List disablePadding>
              {targets.map(target => (
                <ListItem
                  button
                  key={target.ticketId}
                  selected={selectedTicketId === target.ticketId}
                  onClick={() => setSelectedTicketId(target.ticketId)}
                  disabled={submitting}
                >
                  <ListItemText
                    primary={target.contactName}
                    secondary={`${
                      target.queueName || i18n.t("forwardMessageModal.noQueue")
                    } • ${getStatusLabel(target.status)}`}
                  />
                </ListItem>
              ))}
            </List>
          )}
        </div>
      </DialogContent>
      <DialogActions>
        <Button
          onClick={handleClose}
          color="secondary"
          variant="outlined"
          disabled={submitting}
        >
          {i18n.t("forwardMessageModal.buttons.cancel")}
        </Button>
        <ButtonWithSpinner
          onClick={handleForward}
          color="primary"
          variant="contained"
          loading={submitting}
          disabled={!selectedTicketId || submitting}
        >
          {i18n.t("forwardMessageModal.buttons.forward")}
        </ButtonWithSpinner>
      </DialogActions>
    </Dialog>
  );
};

export default ForwardMessageModal;
