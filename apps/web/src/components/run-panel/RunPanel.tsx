import { useAtomValue } from "@effect/atom-react";
import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import {
  derivePendingThreadRequests,
  type PendingThreadRequests,
} from "@t3tools/client-runtime/state/thread-requests";
import type { EnvironmentThreadStatus } from "@t3tools/client-runtime/state/threads";
import type { OrchestrationV2PlanArtifact, ScopedThreadRef, RunId } from "@t3tools/contracts";
import { Link } from "@tanstack/react-router";
import { Check, ChevronRight, Circle, CircleDot, CircleAlert, ListTodo } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import {
  useAssistantMessageText,
  useQuietThreadProjection,
  useQuietThreadShells,
  useThreadStatus,
} from "../../state/entities";
import { useEnvironment } from "../../state/environments";
import { orchestrationEnvironment } from "../../state/orchestration";
import { useEnvironmentQuery } from "../../state/query";
import { revisionedQuery } from "../../state/revisionedQuery";
import { environmentThreadDetails } from "../../state/threads";
import { buildThreadRouteParams } from "../../threadRoutes";
import { useRightPanelStore } from "../../rightPanelStore";
import { Button } from "../ui/button";
import ChatMarkdown from "../ChatMarkdown";
import {
  deriveRunPanelModel,
  type RunPanelModel,
  type RunPanelRow,
  type RunPanelInput,
} from "./runPanelModel";
import styles from "./RunPanel.module.css";

function useCreatedThreads(
  threadRef: ScopedThreadRef,
  projection: RunPanelInput["projection"] | undefined,
) {
  const revision = projection
    ? JSON.stringify([
        projection.turnItems
          .filter((item) => item.type === "thread_created")
          .map((item) => [item.targetThreadId, item.runId])
          .sort(),
        projection.runs
          .filter((run) => run.status === "rolled_back")
          .map((run) => run.id)
          .sort(),
      ])
    : null;
  return useEnvironmentQuery(
    revisionedQuery(
      orchestrationEnvironment.createdThreads({
        environmentId: threadRef.environmentId,
        input: { threadId: threadRef.threadId },
      }),
      revision,
    ),
  );
}

export function RunPanelButton({ threadRef, open }: { threadRef: ScopedThreadRef; open: boolean }) {
  const thread = useQuietThreadProjection(threadRef);
  const shells = useQuietThreadShells();
  const status = useThreadStatus(threadRef);
  const environment = useEnvironment(threadRef.environmentId);
  const created = useCreatedThreads(threadRef, thread?.projection);
  const count =
    status === "live" && environment?.connection.phase === "connected" && thread
      ? deriveRunPanelModel({
          environmentId: threadRef.environmentId,
          projection: thread.projection,
          shells,
          createdThreads: created.data?.threads ?? [],
        }).rows.filter((row) => row.group === "attention").length
      : 0;
  return (
    <Button
      variant="ghost"
      size="sm"
      aria-label={count ? `Open Run, ${count} need a look` : "Open Run"}
      onClick={() => useRightPanelStore.getState().open(threadRef, "run")}
    >
      <ListTodo className="size-4" />
      Run{!open && count > 0 ? <span className="tabular-nums">{count}</span> : null}
    </Button>
  );
}

export function RunPanel({
  threadRef,
  onRespondInChat,
}: {
  threadRef: ScopedThreadRef;
  onRespondInChat: () => void;
}) {
  const thread = useQuietThreadProjection(threadRef);
  const shells = useQuietThreadShells();
  const status = useThreadStatus(threadRef);
  const error = useAtomValue(environmentThreadDetails.errorAtom(threadRef));
  const environment = useEnvironment(threadRef.environmentId);
  const connected = environment?.connection.phase === "connected";
  const created = useCreatedThreads(threadRef, thread?.projection);
  const model = thread
    ? deriveRunPanelModel({
        environmentId: threadRef.environmentId,
        projection: thread.projection,
        shells,
        createdThreads: created.data?.threads ?? [],
      })
    : null;
  return (
    <RunPanelView
      key={scopedThreadKey(threadRef)}
      threadRef={threadRef}
      model={model}
      status={status}
      connected={connected}
      error={error}
      onRespondInChat={onRespondInChat}
      historyNotice={
        created.error
          ? `Earlier child threads could not be loaded: ${created.error}`
          : created.isPending
            ? "Loading earlier child threads…"
            : null
      }
      renderParent={(row) => <ParentDetails threadRef={threadRef} runId={row.runId} />}
      renderChild={(ref) => <ChildDetails key={scopedThreadKey(ref)} threadRef={ref} />}
    />
  );
}

export function RunPanelView({
  threadRef,
  model,
  status,
  connected,
  error,
  onRespondInChat,
  renderChild,
  renderParent,
  historyNotice,
}: {
  threadRef: ScopedThreadRef;
  model: RunPanelModel | null;
  status: EnvironmentThreadStatus;
  connected: boolean;
  error: string | null;
  onRespondInChat: () => void;
  renderChild: (ref: ScopedThreadRef) => ReactNode;
  renderParent?: (row: RunPanelRow) => ReactNode;
  historyNotice?: string | null;
}) {
  const [selection, setSelection] = useState<{ scope: string; key: string | null } | null>(null);
  const scope = scopedThreadKey(threadRef);
  const selected =
    selection?.scope === scope
      ? model?.rows.find((row) => row.key === selection.key)
      : model?.rows.find(
          (row) =>
            row.kind === "parent" &&
            row.group === "attention" &&
            (model.pendingRequests.approvals.length > 0 ||
              model.pendingRequests.userInputs.length > 0),
        );
  const live = connected && status === "live" && !error;
  const renderRow = (row: RunPanelRow) => (
    <li key={row.key}>
      <button
        type="button"
        className={styles["run-panel-row"]}
        aria-expanded={selected?.key === row.key}
        onClick={() => setSelection({ scope, key: selected?.key === row.key ? null : row.key })}
      >
        {row.group === "attention" ? (
          <CircleAlert aria-hidden className="size-4" />
        ) : row.status === "completed" ? (
          <Check aria-hidden className="size-4" />
        ) : (
          <Circle aria-hidden className="size-3" />
        )}
        <span className={styles["run-panel-row-copy"]}>
          <span className={styles["run-panel-title"]}>{row.title}</span>
          <span className={styles["run-panel-secondary"]}>
            {row.pendingRequestHint ? "Request pending" : statusLabel(row.status)}
            {row.kind === "parent"
              ? " · This thread"
              : row.kind === "subagent"
                ? " · Subagent"
                : " · Child thread"}
          </span>
          {row.progress ? (
            <span className={styles["run-panel-progress"]}>{row.progress}</span>
          ) : null}
        </span>
        <ChevronRight aria-hidden className="size-3" />
      </button>
      {selected?.key === row.key ? (
        <div className={styles["run-panel-detail"]}>
          {row.detail ? <Detail title="Prompt" text={row.detail} /> : null}
          {row.result ? (
            <Detail title="Result" text={row.result} markdown threadRef={row.thread ?? threadRef} />
          ) : null}
          {row.kind === "parent" && row.status !== "queued" ? (
            <RequestDetails
              requests={model!.pendingRequests}
              live={live}
              onRespondInChat={onRespondInChat}
            />
          ) : null}
          {row.kind === "parent" && renderParent ? (
            <ParentActivity key={row.key}>{renderParent(row)}</ParentActivity>
          ) : null}
          {row.kind === "child" && row.thread ? (
            <>
              {renderChild(row.thread)}
              <Button
                variant="outline"
                size="sm"
                render={
                  <Link
                    to="/$environmentId/$threadId"
                    params={buildThreadRouteParams(row.thread)}
                  />
                }
              >
                Open thread
              </Button>
            </>
          ) : null}
          {!row.detail && !row.result && row.kind === "subagent" ? (
            <p className={styles["run-panel-secondary"]}>No further details were reported.</p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
  return (
    <div className={styles["run-panel"]} aria-label="Run">
      <div className={styles["run-panel-heading"]}>
        <h2>Run</h2>
        <span className={styles["run-panel-secondary"]}>
          {live ? "Live activity" : "Activity snapshot"}
        </span>
      </div>
      {historyNotice ? (
        <p role="status" className={styles["run-panel-notice"]}>
          {historyNotice}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className={styles["run-panel-notice"]}>
          Could not update activity: {error}
        </p>
      ) : null}
      {status === "deleted" ? (
        <p className={styles["run-panel-notice"]}>This thread is no longer available.</p>
      ) : !connected ? (
        <p className={styles["run-panel-notice"]}>
          Waiting for the environment connection. Activity may be out of date.
        </p>
      ) : status !== "live" ? (
        <p role="status" className={styles["run-panel-notice"]}>
          {model ? "Updating saved activity…" : "Loading activity…"}
        </p>
      ) : null}
      {model && status !== "deleted" ? (
        <>
          {!model.rows.some((row) => row.group === "attention") ? (
            <p className={styles["run-panel-calm"]}>
              {live ? "Nothing needs your attention." : "No requests in this snapshot."}
            </p>
          ) : null}
          {(
            [
              ["attention", "Needs a look"],
              ["working", "Working"],
              ["upNext", "Up next"],
              ["unavailable", "Unavailable"],
            ] as const
          ).map(([group, title]) => {
            const rows = model.rows.filter((row) => row.group === group);
            return rows.length ? (
              <section key={group} className={styles["run-panel-section"]} aria-label={title}>
                <h3>
                  {title}
                  <span className={styles["run-panel-count"]}>{rows.length}</span>
                </h3>
                <ul className={styles["run-panel-rows"]} data-group={group}>
                  {rows.map(renderRow)}
                </ul>
              </section>
            ) : null;
          })}
          {model.plan ? (
            <PlanDetails
              plan={model.plan}
              activeRun={live && planRunIsActive(model)}
              threadRef={threadRef}
            />
          ) : null}
          {model.rows.some((row) => row.group === "finished") ? (
            <details
              className={styles["run-panel-section"]}
              onToggle={(event) => {
                if (!event.currentTarget.open && selected?.group === "finished")
                  setSelection({ scope, key: null });
              }}
            >
              <summary>
                Finished{" "}
                <span className={styles["run-panel-count"]}>
                  {model.rows.filter((row) => row.group === "finished").length}
                </span>
              </summary>
              <ul className={styles["run-panel-rows"]}>
                {model.rows.filter((row) => row.group === "finished").map(renderRow)}
              </ul>
            </details>
          ) : null}
          {model.rows.length === 0 && !model.plan ? (
            <p className={styles["run-panel-secondary"]}>
              Activity and plans will appear when this thread runs.
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function ParentActivity({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className={styles["run-panel-section"]}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>Activity</summary>
      {open ? <div className="flex flex-col gap-3">{children}</div> : null}
    </details>
  );
}

function ParentDetails({
  threadRef,
  runId,
}: {
  threadRef: ScopedThreadRef;
  runId: RunId | undefined;
}) {
  const thread = useQuietThreadProjection(threadRef);
  const items = thread?.projection.turnItems.filter((item) => item.runId === runId);
  const prompt = items?.find((item) => item.type === "user_message");
  const message = items?.findLast((item) => item.type === "assistant_message");
  const output = useAssistantMessageText(threadRef, message?.id);
  return (
    <>
      {prompt?.type === "user_message" ? <Detail title="Prompt" text={prompt.text} /> : null}
      {output ? (
        <Detail title="Latest response" text={output} markdown threadRef={threadRef} />
      ) : null}
      {!prompt && !output ? (
        <p className={styles["run-panel-secondary"]}>
          No further activity has been reported for this execution.
        </p>
      ) : null}
    </>
  );
}

function ChildDetails({ threadRef }: { threadRef: ScopedThreadRef }) {
  const thread = useQuietThreadProjection(threadRef);
  const status = useThreadStatus(threadRef);
  const error = useAtomValue(environmentThreadDetails.errorAtom(threadRef));
  const environment = useEnvironment(threadRef.environmentId);
  const latestMessage = thread?.projection.turnItems.findLast(
    (item) => item.type === "assistant_message",
  );
  const output = useAssistantMessageText(threadRef, latestMessage?.id);
  if (status === "deleted")
    return (
      <p className={styles["run-panel-secondary"]}>This child thread is no longer available.</p>
    );
  if (error) return <p role="alert">Could not load child activity: {error}</p>;
  if (!thread)
    return (
      <p className={styles["run-panel-secondary"]}>
        {environment?.connection.phase === "connected"
          ? "Loading child activity…"
          : "Child activity is unavailable while disconnected."}
      </p>
    );
  const requests = derivePendingThreadRequests(thread.projection);
  const model = deriveRunPanelModel({
    environmentId: threadRef.environmentId,
    projection: thread.projection,
    shells: [],
  });
  const live = status === "live" && environment?.connection.phase === "connected";
  return (
    <>
      {!live ? (
        <p className={styles["run-panel-secondary"]}>
          Saved child activity. Open the thread to check its current state.
        </p>
      ) : null}
      <RequestDetails requests={requests} live={false} />
      {output ? (
        <Detail title="Latest response" text={output} markdown threadRef={threadRef} />
      ) : null}
      {model.plan ? (
        <PlanDetails
          plan={model.plan}
          activeRun={live && planRunIsActive(model)}
          threadRef={threadRef}
        />
      ) : null}
    </>
  );
}

function RequestDetails({
  requests,
  live,
  onRespondInChat,
}: {
  requests: PendingThreadRequests;
  live: boolean;
  onRespondInChat?: () => void;
}) {
  const actionable =
    requests.approvals.some((request) => request.responseCapability === "live") ||
    requests.userInputs.some((request) => request.responseCapability !== "not_resumable");
  return (
    <>
      {requests.approvals.map((request) => (
        <Detail
          key={request.requestId}
          title={
            request.responseCapability === "live"
              ? "Approval requested"
              : "Approval no longer resumable"
          }
          text={request.detail ?? request.reason ?? request.requestKind}
        />
      ))}
      {requests.userInputs.map((request) => (
        <div key={request.requestId}>
          {request.questions.map((question) => (
            <Detail key={question.id} title={question.header} text={question.question} />
          ))}
        </div>
      ))}
      {live && actionable && onRespondInChat ? (
        <Button variant="outline" size="sm" onClick={onRespondInChat}>
          Respond in chat
        </Button>
      ) : null}
    </>
  );
}

function Detail({
  title,
  text,
  markdown,
  threadRef,
}: {
  title: string;
  text: string;
  markdown?: boolean;
  threadRef?: ScopedThreadRef;
}) {
  return (
    <div className={styles["run-panel-detail-section"]}>
      <h4>{title}</h4>
      {markdown ? (
        <ChatMarkdown
          text={text}
          cwd={undefined}
          threadRef={threadRef}
          customBlocks={false}
          parseRawHtml={false}
        />
      ) : (
        <p>{text}</p>
      )}
    </div>
  );
}

function planRunIsActive(model: RunPanelModel) {
  return (
    model.plan?.runId != null &&
    model.rows.some(
      (row) =>
        row.kind === "parent" &&
        row.runId === model.plan?.runId &&
        ["preparing", "starting", "running", "waiting"].includes(row.status),
    )
  );
}

function PlanDetails({
  plan,
  activeRun,
  threadRef,
}: {
  plan: OrchestrationV2PlanArtifact;
  activeRun: boolean;
  threadRef: ScopedThreadRef;
}) {
  return (
    <section className={styles["run-panel-section"]} aria-label="Plan">
      <h3>Plan</h3>
      {plan.kind === "todo_list" ? (
        <>
          {plan.explanation ? (
            <p className={styles["run-panel-secondary"]}>{plan.explanation}</p>
          ) : null}
          <ol className={styles["run-panel-plan"]}>
            {plan.steps.map((step) => (
              <li key={step.id}>
                <span
                  aria-label={
                    step.status === "running" && !activeRun ? "last reported running" : step.status
                  }
                >
                  {step.status === "completed" ? (
                    <Check aria-hidden className="size-3.5" />
                  ) : step.status === "running" && activeRun ? (
                    <CircleDot aria-hidden className="size-3.5" />
                  ) : (
                    <Circle aria-hidden className="size-3" />
                  )}
                </span>
                <span>
                  {step.text}
                  {step.status === "running" ? (
                    <span className={styles["run-panel-secondary"]}>
                      {" "}
                      · {activeRun ? "Running" : "Last reported running"}
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ol>
        </>
      ) : (
        <div className={styles["run-panel-plan-text"]}>
          <ChatMarkdown
            text={plan.markdown}
            cwd={undefined}
            threadRef={threadRef}
            customBlocks={false}
            parseRawHtml={false}
          />
        </div>
      )}
    </section>
  );
}

function statusLabel(status: RunPanelRow["status"]) {
  switch (status) {
    case "completed":
      return "Agent finished";
    case "cancelled":
      return "Cancelled";
    case "failed":
      return "Failed";
    case "interrupted":
      return "Interrupted";
    case "waiting":
      return "Waiting";
    case "pending":
    case "queued":
      return "Queued";
    case "preparing":
    case "starting":
      return "Starting";
    case "running":
      return "Running";
    default:
      return "Activity unavailable";
  }
}

export function useRunResponseFocus({
  scopeKey,
  open,
  present,
  composer,
  focusComposer,
}: {
  scopeKey: string;
  open: boolean;
  present: boolean;
  composer: HTMLElement | null;
  focusComposer: () => void;
}) {
  const pending = useRef<string | null>(null);
  const suppressRestore = useRef(false);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- focuses existing request controls after panel presence releases the modal and consumes the request once
  useEffect(() => {
    if (open) {
      pending.current = null;
      suppressRestore.current = false;
    } else if (!present && pending.current !== null) {
      const requestedScope = pending.current;
      pending.current = null;
      if (requestedScope !== scopeKey) return;
      const target = focusRunRequest(composer, focusComposer);
      if (target) target.focus();
    }
  }, [composer, focusComposer, open, present, scopeKey]);
  return {
    requestFocus: () => {
      pending.current = scopeKey;
      suppressRestore.current = true;
    },
    onCloseFocus: () => !suppressRestore.current,
  };
}

export function focusRunRequest(
  composer: HTMLElement | null,
  focusComposer: () => void,
): HTMLElement | false {
  composer
    ?.querySelector<HTMLButtonElement>('[data-pending-user-input-toggle="collapsed"]')
    ?.click();
  const question = composer?.querySelector<HTMLElement>("[data-pending-user-input-toggle]");
  if (question) return question;
  focusComposer();
  return false;
}
