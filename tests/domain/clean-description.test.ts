import { describe, it, expect } from "vitest";
import { cleanDescription } from "../../src/domain/services/clean-description.js";

describe("cleanDescription (calendar pure helper)", () => {
  it("strips HTML tags", () => {
    expect(cleanDescription("Hello <b>World</b>")).toBe("Hello World");
  });

  it("removes Outlook border lines", () => {
    const input = "Join\n-::~:~::~:~::~:~::~:~::~:~::~:~::~:~::- \nlink";
    expect(cleanDescription(input)).toBe("Join\nlink");
  });
});
