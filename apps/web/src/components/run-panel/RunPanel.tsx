import { useAtomValue } from "@effect/atom-react";
import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import {
  derivePendingThreadRequests,
  type PendingThreadRequests,
} from "@t3tools/client-runtime/state/thread-requests";
import type { EnvironmentThreadStatus } from "@t3tools/client-runtime/state/threads";
import type { OrchestrationV2PlanArtifact, ScopedThreadRef, RunId } from "@t3tools/contracts";
import { Link } from "@tanstack/react-router";
import { T, useGT } from "gt-react";
import {
  Ban,
  Check,
  ChevronRight,
  Circle,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CircleDot,
  CircleX,
  CircleDotDashed,
  CircleHelp,
  ListTodo,
} from "lucide-react";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
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
import { environmentThreadDetails, threadFamilies } from "../../state/threads";
import { appAtomRegistry } from "../../rpc/atomRegistry";
import { cn } from "../../lib/utils";
import { buildThreadRouteParams } from "../../threadRoutes";
import { useRightPanelStore } from "../../rightPanelStore";
import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { CollapsibleSectionHeader } from "../ui/collapsible-section-header";
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
  const gt = useGT();
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
      aria-label={count ? gt("Open Run, {count} need a look", { count }) : gt("Open Run")}
      onClick={() => useRightPanelStore.getState().open(threadRef, "run")}
    >
      <ListTodo className="size-4" />
      <T>Run</T>
      {!open && count > 0 ? <span className="tabular-nums">{count}</span> : null}
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
  const gt = useGT();
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Keep the registry's family read mounted while Run is visible.
  useEffect(
    () => threadFamilies.mount(appAtomRegistry, threadRef.environmentId, threadRef.threadId),
    [threadRef.environmentId, threadRef.threadId],
  );
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
          ? gt("Earlier child threads could not be loaded: {error}", { error: created.error })
          : created.isPending
            ? gt("Loading earlier child threads…")
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
  const gt = useGT();
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
        <RowStatusIcon row={row} label={rowStatusLabel(row, gt)} />
        <span className={styles["run-panel-row-copy"]}>
          <span className={styles["run-panel-title"]}>{row.title}</span>
          <span className={selected?.key === row.key ? styles["run-panel-secondary"] : "sr-only"}>
            {rowStatusLabel(row, gt)}
            {row.kind === "parent"
              ? gt(" · This thread")
              : row.kind === "subagent"
                ? gt(" · Subagent")
                : gt(" · Child thread")}
          </span>
          {row.progress ? (
            <span className={styles["run-panel-progress"]}>{row.progress}</span>
          ) : null}
        </span>
        <ChevronRight aria-hidden className="size-3" />
      </button>
      {selected?.key === row.key ? (
        <div className={styles["run-panel-detail"]}>
          {row.detail ? <Detail title={gt("Prompt")} text={row.detail} /> : null}
          {row.result ? (
            <Detail
              title={gt("Result")}
              text={row.result}
              markdown
              threadRef={row.thread ?? threadRef}
            />
          ) : null}
          {row.kind === "parent" && row.status !== "queued" ? (
            <RequestDetails
              requests={model!.pendingRequests}
              live={live}
              onRespondInChat={onRespondInChat}
            />
          ) : null}
          {row.kind === "parent" && renderParent ? (
            <RunSection key={`${scope}:${row.key}`} title={gt("Activity")} defaultOpen={false}>
              <div className="flex flex-col gap-3">{renderParent(row)}</div>
            </RunSection>
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
                <T>Open thread</T>
              </Button>
            </>
          ) : null}
          {!row.detail && !row.result && row.kind === "subagent" ? (
            <p className={styles["run-panel-secondary"]}>
              <T>No further details were reported.</T>
            </p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
  return (
    <div className={styles["run-panel"]} aria-label={gt("Run")}>
      <div className={styles["run-panel-heading"]}>
        <h2>
          <T>Run</T>
        </h2>
        <span className={styles["run-panel-secondary"]}>
          {live ? gt("Live activity") : gt("Activity snapshot")}
        </span>
      </div>
      {historyNotice ? (
        <p role="status" className={styles["run-panel-notice"]}>
          {historyNotice}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className={styles["run-panel-notice"]}>
          {gt("Could not update activity: {error}", { error })}
        </p>
      ) : null}
      {status === "deleted" ? (
        <p className={styles["run-panel-notice"]}>
          <T>This thread is no longer available.</T>
        </p>
      ) : !connected ? (
        <p className={styles["run-panel-notice"]}>
          <T>Waiting for the environment connection. Activity may be out of date.</T>
        </p>
      ) : status !== "live" ? (
        <p role="status" className={styles["run-panel-notice"]}>
          {model ? gt("Updating saved activity…") : gt("Loading activity…")}
        </p>
      ) : null}
      {model && status !== "deleted" ? (
        <>
          {!model.rows.some((row) => row.group === "attention") ? (
            <p className={styles["run-panel-calm"]}>
              {live ? gt("Nothing needs your attention.") : gt("No requests in this snapshot.")}
            </p>
          ) : null}
          {(
            [
              ["attention", gt("Needs a look")],
              ["working", gt("Working")],
              ["upNext", gt("Up next")],
              ["unavailable", gt("Unavailable")],
            ] as const
          ).map(([group, title]) => {
            const rows = model.rows.filter((row) => row.group === group);
            return (
              <RunSection
                key={`${scope}:${group}`}
                title={title}
                count={rows.length}
                onCollapse={() => {
                  if (selected?.group === group) setSelection({ scope, key: null });
                }}
              >
                <ul className={styles["run-panel-rows"]} data-group={group}>
                  {rows.map(renderRow)}
                </ul>
              </RunSection>
            );
          })}
          {model.plan ? (
            <PlanDetails
              key={scope}
              plan={model.plan}
              activeRun={live && planRunIsActive(model)}
              threadRef={threadRef}
            />
          ) : null}
          <RunSection
            key={`${scope}:finished`}
            title={gt("Finished")}
            count={model.rows.filter((row) => row.group === "finished").length}
            defaultOpen={false}
            onCollapse={() => {
              if (selected?.group === "finished") setSelection({ scope, key: null });
            }}
          >
            <ul className={styles["run-panel-rows"]}>
              {model.rows.filter((row) => row.group === "finished").map(renderRow)}
            </ul>
          </RunSection>
          {model.rows.length === 0 && !model.plan ? (
            <p className={styles["run-panel-secondary"]}>
              <T>Activity and plans will appear when this thread runs.</T>
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function RunSection({
  title,
  count,
  defaultOpen = true,
  onCollapse,
  children,
}: {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  onCollapse?: () => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const contentId = useId();
  if (count === 0) return null;
  return (
    <section className={styles["run-panel-section"]} aria-label={title}>
      <CollapsibleSectionHeader
        variant="panel"
        expanded={open}
        aria-controls={open ? contentId : undefined}
        accessory={
          count != null ? <span className="font-normal tabular-nums"> {count}</span> : undefined
        }
        onClick={() => {
          if (open) onCollapse?.();
          setOpen(!open);
        }}
      >
        {title}
      </CollapsibleSectionHeader>
      {open ? <div id={contentId}>{children}</div> : null}
    </section>
  );
}

function ParentDetails({
  threadRef,
  runId,
}: {
  threadRef: ScopedThreadRef;
  runId: RunId | undefined;
}) {
  const gt = useGT();
  const thread = useQuietThreadProjection(threadRef);
  const items = thread?.projection.turnItems.filter((item) => item.runId === runId);
  const prompt = items?.find((item) => item.type === "user_message");
  const message = items?.findLast((item) => item.type === "assistant_message");
  const output = useAssistantMessageText(threadRef, message?.id);
  return (
    <>
      {prompt?.type === "user_message" ? <Detail title={gt("Prompt")} text={prompt.text} /> : null}
      {output ? (
        <Detail title={gt("Latest response")} text={output} markdown threadRef={threadRef} />
      ) : null}
      {!prompt && !output ? (
        <p className={styles["run-panel-secondary"]}>
          <T>No further activity has been reported for this execution.</T>
        </p>
      ) : null}
    </>
  );
}

function ChildDetails({ threadRef }: { threadRef: ScopedThreadRef }) {
  const gt = useGT();
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
      <p className={styles["run-panel-secondary"]}>
        <T>This child thread is no longer available.</T>
      </p>
    );
  if (error) return <p role="alert">{gt("Could not load child activity: {error}", { error })}</p>;
  if (!thread)
    return (
      <p className={styles["run-panel-secondary"]}>
        {environment?.connection.phase === "connected"
          ? gt("Loading child activity…")
          : gt("Child activity is unavailable while disconnected.")}
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
          <T>Saved child activity. Open the thread to check its current state.</T>
        </p>
      ) : null}
      <RequestDetails requests={requests} live={false} />
      {output ? (
        <Detail title={gt("Latest response")} text={output} markdown threadRef={threadRef} />
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
  const gt = useGT();
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
              ? gt("Approval requested")
              : gt("Approval no longer resumable")
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
          <T>Respond in chat</T>
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
  const gt = useGT();
  return (
    <RunSection key={scopedThreadKey(threadRef)} title={gt("Plan")}>
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
                    step.status === "running" && !activeRun
                      ? gt("last reported running")
                      : step.status
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
                      · {activeRun ? gt("Running") : gt("Last reported running")}
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
    </RunSection>
  );
}

function statusLabel(status: RunPanelRow["status"], gt: ReturnType<typeof useGT>) {
  switch (status) {
    case "completed":
      return gt("Agent finished");
    case "cancelled":
      return gt("Cancelled");
    case "ended":
      return gt("Ended");
    case "failed":
      return gt("Failed");
    case "interrupted":
      return gt("Interrupted");
    case "waiting":
      return gt("Waiting");
    case "pending":
    case "queued":
      return gt("Queued");
    case "preparing":
    case "starting":
      return gt("Starting");
    case "running":
      return gt("Running");
    default:
      return gt("Activity unavailable");
  }
}

function rowStatusLabel(row: RunPanelRow, gt: ReturnType<typeof useGT>) {
  return row.pendingRequestHint ? gt("Request pending") : statusLabel(row.status, gt);
}

// Static icons matching the sidebar (TOP_STATUS_ICONS); hues follow resolveThreadStatusPill via semantic tokens.
// aria-hidden because the row's sr-only text already names the status; the tooltip serves pointer users.
function RowStatusIcon({ row, label }: { row: RunPanelRow; label: string }) {
  const { status } = row;
  const [Icon, tone] =
    status === "failed" || status === "interrupted"
      ? ([CircleX, "text-error"] as const)
      : row.group === "attention"
        ? ([CircleAlert, "text-warning"] as const)
        : status === "running" || status === "starting" || status === "preparing"
          ? ([CircleDashed, "text-info"] as const)
          : status === "waiting" || status === "queued" || status === "pending"
            ? ([CircleDotDashed, "text-muted-foreground"] as const)
            : status === "completed"
              ? ([CircleCheck, "text-success"] as const)
              : status === "ended"
                ? ([CircleCheck, "text-muted-foreground"] as const)
                : status === "cancelled"
                  ? ([Ban, "text-muted-foreground"] as const)
                  : ([CircleHelp, "text-muted-foreground"] as const);
  return (
    <Tooltip>
      <TooltipTrigger
        render={<span aria-hidden className={cn(styles["run-panel-status"], tone)} />}
      >
        <Icon className="size-4" />
      </TooltipTrigger>
      <TooltipPopup side="top">{label}</TooltipPopup>
    </Tooltip>
  );
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

/** ChatView's Run panel wiring: the header button, "Respond in chat", and focus after the sheet closes. */
export function useRunPanelChatControls({
  threadRef,
  buttonOpen,
  scrollToEnd,
  usesSheet,
  closePanel,
  ...focusInput
}: {
  /** Null when the thread has no Run panel. */
  threadRef: ScopedThreadRef | null;
  buttonOpen: boolean;
  scrollToEnd: (animated: boolean) => void;
  usesSheet: boolean;
  closePanel: () => void;
} & Parameters<typeof useRunResponseFocus>[0]) {
  const responseFocus = useRunResponseFocus(focusInput);
  return {
    button: threadRef ? <RunPanelButton threadRef={threadRef} open={buttonOpen} /> : null,
    onRespondInChat: () => {
      scrollToEnd(true);
      if (usesSheet) {
        responseFocus.requestFocus();
        closePanel();
      } else {
        const target = focusRunRequest(focusInput.composer, focusInput.focusComposer);
        if (target) target.focus();
      }
    },
    onCloseFocus: responseFocus.onCloseFocus,
  };
}

function focusRunRequest(
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
