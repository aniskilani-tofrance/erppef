import { describe, expect, it } from "vitest";
import { formatPhone, toWhatsAppNumber, whatsappLink } from "@/lib/admission/phone";

describe("numéros → WhatsApp", () => {
  it("normalise les numéros français au format international sans +", () => {
    expect(toWhatsAppNumber("06 12 34 56 78")).toBe("33612345678");
    expect(toWhatsAppNumber("07.12.34.56.78")).toBe("33712345678");
    expect(toWhatsAppNumber("+33 6 12 34 56 78")).toBe("33612345678");
    expect(toWhatsAppNumber("0033612345678")).toBe("33612345678");
    expect(toWhatsAppNumber("612345678")).toBe("33612345678");
    expect(toWhatsAppNumber("33612345678")).toBe("33612345678");
  });

  it("garde les numéros étrangers explicites", () => {
    expect(toWhatsAppNumber("+212 6 12 34 56 78")).toBe("212612345678");
    expect(toWhatsAppNumber("+93 70 123 4567")).toBe("93701234567");
  });

  it("rejette ce qui n'est pas un numéro exploitable", () => {
    expect(toWhatsAppNumber(null)).toBeNull();
    expect(toWhatsAppNumber("")).toBeNull();
    expect(toWhatsAppNumber("   ")).toBeNull();
    expect(toWhatsAppNumber("à demander")).toBeNull();
    expect(toWhatsAppNumber("12345")).toBeNull();
  });

  it("construit le lien wa.me avec le message encodé", () => {
    const link = whatsappLink("06 12 34 56 78", "Bonjour Fatima,\nÀ bientôt !");
    expect(link).toBe("https://wa.me/33612345678?text=Bonjour%20Fatima%2C%0A%C3%80%20bient%C3%B4t%20!");
    expect(whatsappLink("nc", "x")).toBeNull();
  });

  it("affiche les numéros français par paires", () => {
    expect(formatPhone("0612345678")).toBe("06 12 34 56 78");
    expect(formatPhone("+33612345678")).toBe("06 12 34 56 78");
    expect(formatPhone("+212612345678")).toBe("+212612345678");
    expect(formatPhone(null)).toBe("—");
  });
});
