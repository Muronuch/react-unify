export const ConfirmDialog = ({ open }: { open: boolean }) => (
  open ? <div className="modal-backdrop"><dialog>Are you sure?</dialog></div> : null
);
