import { useEffect, useMemo, useState } from "react";
import type { Group, Protocol, SessionPublic, UpsertAuthInput, UpsertSessionInput, UUID } from "../types";
import { Modal } from "./Modal";
import { open } from "@tauri-apps/plugin-dialog";
import { t, tf } from "../lib/i18n";

export function SessionEditor(props: {
  open: boolean;
  onClose: () => void;
  groups: Group[];
  session?: SessionPublic | null;
  onSubmit: (input: UpsertSessionInput) => Promise<void>;
  titleOverride?: string;
  submitLabel?: string;
  hidePersistenceFields?: boolean;
  lang?: string;
}) {
  const editing = props.session ?? null;
  const lang = props.lang ?? "zh-CN";
  const [name, setName] = useState("");
  const [host, setHost] = useState("");
  const [port, setPort] = useState(22);
  const [username, setUsername] = useState("");
  const [protocol, setProtocol] = useState<Protocol>("ssh");
  const [groupId, setGroupId] = useState<UUID | null>(null);
  const [favorite, setFavorite] = useState(false);

  const [authType, setAuthType] = useState<"password" | "key">("password");
  const [password, setPassword] = useState("");
  const [privateKeyPath, setPrivateKeyPath] = useState("");
  const [passphrase, setPassphrase] = useState("");

  const [encoding, setEncoding] = useState("utf-8");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!props.open) return;
    setError(null);
    setName(editing?.name ?? "");
    setHost(editing?.host ?? "");
    setPort(editing?.port ?? 22);
    setUsername(editing?.username ?? "");
    setProtocol(editing?.protocol ?? "ssh");
    setGroupId(editing?.groupId ?? null);
    setFavorite(editing?.favorite ?? false);
    setAuthType(editing?.authType ?? "password");
    setPrivateKeyPath(editing?.privateKeyPath ?? "");
    setEncoding(editing?.appearance.encoding ?? "utf-8");
    setPassword("");
    setPassphrase("");
  }, [props.open, editing]);

  const protocols = useMemo(
    () =>
      [
        { label: "SSH", value: "ssh" as const },
        { label: t(lang, "protocolTelnetUnsupported"), value: "telnet" as const, disabled: true },
        { label: t(lang, "protocolRloginUnsupported"), value: "rlogin" as const, disabled: true },
      ] satisfies { label: string; value: Protocol; disabled?: boolean }[],
    [lang],
  );

  const title = useMemo(() => props.titleOverride ?? (editing ? tf(lang, "sessionEditWithName", { name: editing.name }) : t(lang, "sessionCreate")), [editing, props.titleOverride, lang]);

  async function pickKey() {
    const p = await open({ multiple: false });
    if (!p || Array.isArray(p)) return;
    setPrivateKeyPath(p);
  }

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      if (!host.trim() || !username.trim()) throw new Error(t(lang, "sessionErrorHostAndUsernameRequired"));
      let auth: UpsertAuthInput;
      if (authType === "password") {
        auth = { type: "password", password: password ? password : null };
      } else {
        if (!privateKeyPath.trim()) throw new Error(t(lang, "sessionErrorPrivateKeyRequired"));
        auth = { type: "key", privateKeyPath, passphrase: passphrase ? passphrase : null };
      }

      const input: UpsertSessionInput = {
        id: editing?.id ?? null,
        name: name.trim() ? name.trim() : `${username}@${host}`,
        host: host.trim(),
        port,
        username: username.trim(),
        protocol,
        auth,
        appearance: {
          theme: null,
          fontFamily: null,
          fontSize: null,
          lineHeight: null,
          encoding,
        },
        connection: null,
        groupId,
        favorite,
        sortIndex: null,
      };

      await props.onSubmit(input);
      props.onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={title}
      open={props.open}
      onClose={() => {
        if (!saving) props.onClose();
      }}
      footer={
        <div className="flex gap-2 items-center">
          {error ? <div className="text-red-400 text-sm flex-1 truncate">{error}</div> : <div className="flex-1" />}
          <button
            onClick={submit}
            disabled={saving}
            className={[
              "px-4 py-2 rounded text-sm",
              saving ? "bg-[var(--color-gray-800)] text-[var(--color-gray-500)]" : "bg-[var(--color-blue-600)] text-white hover:bg-[var(--color-blue-700)]",
            ].join(" ")}
          >
            {props.submitLabel ?? t(lang, "save")}
          </button>
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <label className={["flex flex-col gap-1.5", props.hidePersistenceFields ? "col-span-2" : ""].join(" ")}>
          <div className="text-sm text-[var(--color-gray-300)]">{t(lang, "sessionName")}</div>
          <input
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            className="w-full px-3 py-2 bg-[var(--color-gray-800)] border border-[var(--color-gray-700)] rounded text-white placeholder:text-[var(--color-gray-500)] focus:outline-none focus:border-[var(--color-blue-500)]"
          />
        </label>
        {props.hidePersistenceFields ? null : (
          <label className="flex flex-col gap-1.5">
            <div className="text-sm text-[var(--color-gray-300)]">{t(lang, "sessionGroup")}</div>
            <select
              value={groupId ?? ""}
              onChange={(e) => setGroupId(e.currentTarget.value ? e.currentTarget.value : null)}
              className="w-full px-3 py-2 bg-[var(--color-gray-800)] border border-[var(--color-gray-700)] rounded text-white focus:outline-none focus:border-[var(--color-blue-500)]"
            >
              <option value="">{t(lang, "sidebarUngrouped")}</option>
              {props.groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="flex flex-col gap-1.5">
          <div className="text-sm text-[var(--color-gray-300)]">Host</div>
          <input
            value={host}
            onChange={(e) => setHost(e.currentTarget.value)}
            placeholder={t(lang, "sessionHostPlaceholder")}
            className="w-full px-3 py-2 bg-[var(--color-gray-800)] border border-[var(--color-gray-700)] rounded text-white placeholder:text-[var(--color-gray-500)] focus:outline-none focus:border-[var(--color-blue-500)]"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <div className="text-sm text-[var(--color-gray-300)]">Port</div>
          <input
            type="number"
            value={port}
            onChange={(e) => setPort(Number(e.currentTarget.value))}
            className="w-full px-3 py-2 bg-[var(--color-gray-800)] border border-[var(--color-gray-700)] rounded text-white focus:outline-none focus:border-[var(--color-blue-500)]"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <div className="text-sm text-[var(--color-gray-300)]">{t(lang, "sessionUsername")}</div>
          <input
            value={username}
            onChange={(e) => setUsername(e.currentTarget.value)}
            className="w-full px-3 py-2 bg-[var(--color-gray-800)] border border-[var(--color-gray-700)] rounded text-white placeholder:text-[var(--color-gray-500)] focus:outline-none focus:border-[var(--color-blue-500)]"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <div className="text-sm text-[var(--color-gray-300)]">{t(lang, "sessionProtocol")}</div>
          <select
            value={protocol}
            onChange={(e) => setProtocol(e.currentTarget.value as Protocol)}
            className="w-full px-3 py-2 bg-[var(--color-gray-800)] border border-[var(--color-gray-700)] rounded text-white focus:outline-none focus:border-[var(--color-blue-500)]"
          >
            {protocols.map((p) => (
              <option key={p.value} value={p.value} disabled={p.disabled}>
                {p.label}
              </option>
            ))}
          </select>
        </label>

        {props.hidePersistenceFields ? null : (
          <label className="flex gap-2 items-center">
            <input type="checkbox" checked={favorite} onChange={(e) => setFavorite(e.currentTarget.checked)} />
            <div className="text-sm text-[var(--color-gray-300)]">{t(lang, "sessionFavorite")}</div>
          </label>
        )}
        <label className={["flex flex-col gap-1.5", props.hidePersistenceFields ? "col-span-2" : ""].join(" ")}>
          <div className="text-sm text-[var(--color-gray-300)]">{t(lang, "sessionEncoding")}</div>
          <select
            value={encoding}
            onChange={(e) => setEncoding(e.currentTarget.value)}
            className="w-full px-3 py-2 bg-[var(--color-gray-800)] border border-[var(--color-gray-700)] rounded text-white focus:outline-none focus:border-[var(--color-blue-500)]"
          >
            <option value="utf-8">UTF-8</option>
            <option value="gbk">{t(lang, "encodingGBKExperimental")}</option>
            <option value="gb18030">{t(lang, "encodingGB18030Experimental")}</option>
          </select>
        </label>
      </div>

      <div className="mt-4 pt-3 border-t border-[var(--color-gray-800)]">
        <div className="font-medium text-sm text-white mb-2">{t(lang, "sessionAuth")}</div>
        <div className="flex gap-4 items-center mb-3">
          <label className="flex gap-2 items-center text-sm text-[var(--color-gray-300)]">
            <input type="radio" checked={authType === "password"} onChange={() => setAuthType("password")} />
            <div>{t(lang, "sessionAuthPassword")}</div>
          </label>
          <label className="flex gap-2 items-center text-sm text-[var(--color-gray-300)]">
            <input type="radio" checked={authType === "key"} onChange={() => setAuthType("key")} />
            <div>{t(lang, "sessionAuthKey")}</div>
          </label>
        </div>

        {authType === "password" ? (
          <label className="flex flex-col gap-1.5">
            <div className="text-sm text-[var(--color-gray-300)]">{t(lang, "sessionPasswordHint")}</div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
              className="w-full px-3 py-2 bg-[var(--color-gray-800)] border border-[var(--color-gray-700)] rounded text-white placeholder:text-[var(--color-gray-500)] focus:outline-none focus:border-[var(--color-blue-500)]"
            />
          </label>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex gap-2 items-center">
              <input
                className="flex-1 px-3 py-2 bg-[var(--color-gray-800)] border border-[var(--color-gray-700)] rounded text-white placeholder:text-[var(--color-gray-500)] focus:outline-none focus:border-[var(--color-blue-500)]"
                value={privateKeyPath}
                onChange={(e) => setPrivateKeyPath(e.currentTarget.value)}
                placeholder={t(lang, "sessionKeyPathPlaceholder")}
              />
              <button onClick={pickKey} className="px-3 py-2 rounded bg-[var(--color-gray-800)] text-[var(--color-gray-300)] hover:bg-[var(--color-gray-700)]">
                {t(lang, "chooseEllipsis")}
              </button>
            </div>
            <label className="flex flex-col gap-1.5">
              <div className="text-sm text-[var(--color-gray-300)]">{t(lang, "sessionPassphraseHint")}</div>
              <input
                type="password"
                value={passphrase}
                onChange={(e) => setPassphrase(e.currentTarget.value)}
                className="w-full px-3 py-2 bg-[var(--color-gray-800)] border border-[var(--color-gray-700)] rounded text-white placeholder:text-[var(--color-gray-500)] focus:outline-none focus:border-[var(--color-blue-500)]"
              />
            </label>
          </div>
        )}
      </div>
    </Modal>
  );
}
