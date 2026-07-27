import { describe, it, expect, vi, beforeEach } from "vitest";
import { setupDelegatedEvents } from "../../src/renderer/events/delegation.js";

describe("setupDelegatedEvents", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("no-ops when #app is missing", () => {
    expect(() =>
      setupDelegatedEvents({
        onForcePoll: vi.fn(),
        onGrantAccess: vi.fn(),
        onJoinMeeting: vi.fn(),
      }),
    ).not.toThrow();
  });

  it("routes refresh and retry to onForcePoll", () => {
    document.body.innerHTML =
      '<div id="app"><button data-action="refresh">R</button><button data-action="retry">T</button></div>';
    const onForcePoll = vi.fn();
    setupDelegatedEvents({
      onForcePoll,
      onGrantAccess: vi.fn(),
      onJoinMeeting: vi.fn(),
    });
    document.querySelector<HTMLButtonElement>('[data-action="refresh"]')!.click();
    document.querySelector<HTMLButtonElement>('[data-action="retry"]')!.click();
    expect(onForcePoll).toHaveBeenCalledTimes(2);
  });

  it("routes grant-access", () => {
    document.body.innerHTML =
      '<div id="app"><button data-action="grant-access">G</button></div>';
    const onGrantAccess = vi.fn();
    setupDelegatedEvents({
      onForcePoll: vi.fn(),
      onGrantAccess,
      onJoinMeeting: vi.fn(),
    });
    document.querySelector<HTMLButtonElement>('[data-action="grant-access"]')!.click();
    expect(onGrantAccess).toHaveBeenCalledOnce();
  });

  it("routes join-meeting with event id and ignores missing id", () => {
    document.body.innerHTML = `<div id="app">
      <button data-action="join-meeting" data-event-id="evt-1">J</button>
      <button data-action="join-meeting">NoId</button>
    </div>`;
    const onJoinMeeting = vi.fn();
    setupDelegatedEvents({
      onForcePoll: vi.fn(),
      onGrantAccess: vi.fn(),
      onJoinMeeting,
    });
    document.querySelectorAll<HTMLButtonElement>('[data-action="join-meeting"]')[0]!.click();
    document.querySelectorAll<HTMLButtonElement>('[data-action="join-meeting"]')[1]!.click();
    expect(onJoinMeeting).toHaveBeenCalledOnce();
    expect(onJoinMeeting).toHaveBeenCalledWith("evt-1");
  });

  it("ignores clicks without data-action", () => {
    document.body.innerHTML = '<div id="app"><span class="x">text</span></div>';
    const onForcePoll = vi.fn();
    setupDelegatedEvents({
      onForcePoll,
      onGrantAccess: vi.fn(),
      onJoinMeeting: vi.fn(),
    });
    document.querySelector(".x")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onForcePoll).not.toHaveBeenCalled();
  });

  it("single listener still routes after innerHTML re-render", () => {
    document.body.innerHTML = '<div id="app"></div>';
    const onForcePoll = vi.fn();
    setupDelegatedEvents({
      onForcePoll,
      onGrantAccess: vi.fn(),
      onJoinMeeting: vi.fn(),
    });
    // Simulate multiple renders swapping button content
    for (let i = 0; i < 3; i++) {
      document.getElementById("app")!.innerHTML =
        '<button data-action="refresh">Refresh</button>';
    }
    document.querySelector<HTMLButtonElement>('[data-action="refresh"]')!.click();
    expect(onForcePoll).toHaveBeenCalledOnce();
  });
});
