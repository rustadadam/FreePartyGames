// Two-tap confirm for destructive host actions (no modal, no hover).
import { useEffect, useState } from 'preact/hooks';

export function ConfirmButton({
  label,
  confirm,
  onConfirm,
  class: cls,
}: {
  label: string;
  confirm: string;
  onConfirm(): void;
  class?: string;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      type="button"
      class={`btn ${armed ? 'btn-danger' : ''} ${cls ?? ''}`}
      onClick={() => {
        if (armed) {
          setArmed(false);
          onConfirm();
        } else setArmed(true);
      }}
    >
      {armed ? confirm : label}
    </button>
  );
}
