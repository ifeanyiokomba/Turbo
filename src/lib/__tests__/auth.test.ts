import { describe, it, expect } from "vitest";
import {
  hashPassword,
  verifyPassword,
  validatePassword,
  hashPin,
  verifyPin,
  isWeakPin,
} from "@/lib/auth";

describe("Password hashing", () => {
  it("should hash a password with scrypt", () => {
    const hash = hashPassword("TestPass123");
    expect(hash).toMatch(/^scrypt\$[a-f0-9]+\$[a-f0-9]+$/);
  });

  it("should verify a correct password", () => {
    const hash = hashPassword("TestPass123");
    expect(verifyPassword("TestPass123", hash)).toBe(true);
  });

  it("should reject an incorrect password", () => {
    const hash = hashPassword("TestPass123");
    expect(verifyPassword("WrongPass", hash)).toBe(false);
  });

  it("should produce different hashes for same password (random salt)", () => {
    const h1 = hashPassword("TestPass123");
    const h2 = hashPassword("TestPass123");
    expect(h1).not.toBe(h2);
  });
});

describe("Password validation", () => {
  it("should reject short passwords", () => {
    expect(validatePassword("Short1")).not.toBeNull();
  });
  it("should accept strong passwords", () => {
    expect(validatePassword("StrongPass123")).toBeNull();
  });
  it("should require uppercase", () => {
    expect(validatePassword("lowercase123")).not.toBeNull();
  });
  it("should require digit", () => {
    expect(validatePassword("NoDigitsHere")).not.toBeNull();
  });
});

describe("PIN hashing", () => {
  it("should hash and verify a PIN", () => {
    const hash = hashPin("1234");
    expect(verifyPin("1234", hash)).toBe(true);
    expect(verifyPin("0000", hash)).toBe(false);
  });
  it("should detect weak PINs", () => {
    expect(isWeakPin("0000")).toBe(true);
    expect(isWeakPin("1234")).toBe(true);
    expect(isWeakPin("9999")).toBe(true);
    expect(isWeakPin("7391")).toBe(false);
  });
});
