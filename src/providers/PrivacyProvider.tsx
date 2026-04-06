import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getSetting } from "@/db/queries/settings";

type PrivacyContextValue = {
  hideAmounts: boolean;
  randomNumbers: boolean;
  toggleHideAmounts: () => void;
  toggleRandomNumbers: () => void;
  /** Mask a number based on current privacy mode */
  maskAmount: (amount: number) => number;
};

const PrivacyContext = createContext<PrivacyContextValue>({
  hideAmounts: false,
  randomNumbers: false,
  toggleHideAmounts: () => {},
  toggleRandomNumbers: () => {},
  maskAmount: (n) => n,
});

// Stable random per session — same input gives same output within one app session
const randomCache = new Map<number, number>();
function getRandomAmount(real: number): number {
  if (randomCache.has(real)) return randomCache.get(real)!;
  const magnitude = Math.max(1, Math.pow(10, Math.floor(Math.log10(Math.abs(real) || 1))));
  const fake = Math.round((Math.random() * magnitude * 2 + magnitude * 0.1) * 100) / 100;
  randomCache.set(real, fake);
  return fake;
}

export function PrivacyProvider({ children }: { children: React.ReactNode }) {
  const [hideAmounts, setHideAmounts] = useState(false);
  const [randomNumbers, setRandomNumbers] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Load defaults from settings
  useEffect(() => {
    Promise.all([getSetting("privacy_hide_default"), getSetting("privacy_random_default")]).then(
      ([hideDefault, randomDefault]) => {
        setHideAmounts(hideDefault === "true");
        setRandomNumbers(randomDefault === "true");
        setLoaded(true);
      },
    );
  }, []);

  const toggleHideAmounts = useCallback(() => {
    setHideAmounts((prev) => !prev);
  }, []);

  const toggleRandomNumbers = useCallback(() => {
    setRandomNumbers((prev) => !prev);
  }, []);

  const maskAmount = useCallback(
    (amount: number): number => {
      if (randomNumbers) return getRandomAmount(amount);
      return amount;
    },
    [randomNumbers],
  );

  const value = useMemo(
    () => ({ hideAmounts, randomNumbers, toggleHideAmounts, toggleRandomNumbers, maskAmount }),
    [hideAmounts, randomNumbers, toggleHideAmounts, toggleRandomNumbers, maskAmount],
  );

  if (!loaded) return null;

  return <PrivacyContext.Provider value={value}>{children}</PrivacyContext.Provider>;
}

export function usePrivacy() {
  return useContext(PrivacyContext);
}
