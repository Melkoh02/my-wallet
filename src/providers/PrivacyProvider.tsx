import { createContext, useCallback, useContext, useState } from "react";

type PrivacyContextValue = {
  hideAmounts: boolean;
  toggleHideAmounts: () => void;
};

const PrivacyContext = createContext<PrivacyContextValue>({
  hideAmounts: false,
  toggleHideAmounts: () => {},
});

export function PrivacyProvider({ children }: { children: React.ReactNode }) {
  const [hideAmounts, setHideAmounts] = useState(false);

  const toggleHideAmounts = useCallback(() => {
    setHideAmounts((prev) => !prev);
  }, []);

  return (
    <PrivacyContext.Provider value={{ hideAmounts, toggleHideAmounts }}>
      {children}
    </PrivacyContext.Provider>
  );
}

export function usePrivacy() {
  return useContext(PrivacyContext);
}
