'use client';

import { useState, useCallback, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useWallet } from '@/hooks/use-wallet';
import type { InjectedAccountWithMeta } from '@polkadot/extension-inject/types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Wallet,
  Plus,
  Download,
  Unlock,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Copy,
  Trash2,
} from 'lucide-react';

export function DesktopWalletDialog() {
  const t = useTranslations('wallet');
  const { isConnected, getAccounts, connect, unlockDesktopAccount } = useWallet();

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Create account state
  const [createName, setCreateName] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [generatedMnemonic, setGeneratedMnemonic] = useState<string | null>(null);
  const [mnemonicConfirmed, setMnemonicConfirmed] = useState(false);

  // Mnemonic verification state
  const [createdAddress, setCreatedAddress] = useState<string | null>(null);
  const [verifyIndices, setVerifyIndices] = useState<number[] | null>(null);
  const [verifySelections, setVerifySelections] = useState<(string | null)[]>([null, null, null]);
  const [shuffledCandidates, setShuffledCandidates] = useState<string[]>([]);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  // Import account state
  const [importMnemonic, setImportMnemonic] = useState('');
  const [importName, setImportName] = useState('');
  const [importPassword, setImportPassword] = useState('');

  // Unlock state
  const [existingAccounts, setExistingAccounts] = useState<InjectedAccountWithMeta[]>([]);
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);
  const [unlockPassword, setUnlockPassword] = useState('');

  // Load existing accounts when dialog opens
  useEffect(() => {
    if (open) {
      loadAccounts();
    }
  }, [open]);

  const loadAccounts = useCallback(async () => {
    try {
      const accs = await getAccounts();
      setExistingAccounts(accs);
    } catch {
      setExistingAccounts([]);
    }
  }, [getAccounts]);

  const clearState = () => {
    setError(null);
    setSuccess(null);
    setLoading(false);
  };

  const resetCreateForm = () => {
    setCreateName('');
    setCreatePassword('');
    setGeneratedMnemonic(null);
    setMnemonicConfirmed(false);
    setCreatedAddress(null);
    setVerifyIndices(null);
    setVerifySelections([null, null, null]);
    setShuffledCandidates([]);
    setVerifyError(null);
  };

  const startMnemonicVerification = () => {
    if (!generatedMnemonic) return;
    const words = generatedMnemonic.split(' ');
    // Pick 3 random unique indices from 0-11, then sort ascending
    const indices: number[] = [];
    while (indices.length < 3) {
      const idx = Math.floor(Math.random() * 12);
      if (!indices.includes(idx)) indices.push(idx);
    }
    indices.sort((a, b) => a - b);

    // Build candidate pool: 3 correct words + 6 decoys from the remaining words
    const correctWords = indices.map((i) => words[i]);
    const remaining = words.filter((_, i) => !indices.includes(i));
    // Shuffle remaining and pick up to 6
    const shuffledRemaining = [...remaining].sort(() => Math.random() - 0.5);
    const decoys = shuffledRemaining.slice(0, 6);
    // Combine and shuffle
    const candidates = [...correctWords, ...decoys].sort(() => Math.random() - 0.5);

    setVerifyIndices(indices);
    setVerifySelections([null, null, null]);
    setShuffledCandidates(candidates);
    setVerifyError(null);
  };

  // Find the next empty slot index, or -1 if all filled
  const nextEmptySlot = verifySelections.findIndex((s) => s === null);

  const handleSelectWord = (word: string) => {
    if (nextEmptySlot === -1) return;
    const next = [...verifySelections];
    next[nextEmptySlot] = word;
    setVerifySelections(next);
    setVerifyError(null);
  };

  const handleUnselectSlot = (slotIdx: number) => {
    const next = [...verifySelections];
    next[slotIdx] = null;
    setVerifySelections(next);
    setVerifyError(null);
  };

  // Words already placed in slots
  const selectedWords = new Set(verifySelections.filter((s): s is string => s !== null));

  const handleVerifyMnemonic = async () => {
    if (!generatedMnemonic || !verifyIndices) return;
    const words = generatedMnemonic.split(' ');
    const correct = verifyIndices.every(
      (idx, i) => verifySelections[i] === words[idx],
    );
    if (correct) {
      const address = createdAddress;
      const password = createPassword;
      resetCreateForm();

      // Auto unlock & connect
      if (address && password) {
        try {
          await unlockDesktopAccount(address, password);
          const accs = await getAccounts();
          const account = accs.find((a) => a.address === address);
          if (account) {
            await connect(account);
          }
          setSuccess(t('mnemonicVerified'));
          setTimeout(() => setOpen(false), 800);
        } catch {
          setSuccess(t('mnemonicVerifiedManual'));
        }
      } else {
        setSuccess(t('mnemonicVerifiedDone'));
      }
    } else {
      setVerifyError(t('verifyFailed'));
    }
  };

  const resetImportForm = () => {
    setImportMnemonic('');
    setImportName('');
    setImportPassword('');
  };

  // Create account
  const handleCreate = useCallback(async () => {
    if (!createName.trim() || !createPassword) return;
    clearState();
    setLoading(true);
    try {
      const dk = await import('@/lib/wallet/desktop-keyring');
      const { mnemonic, address } = await dk.createAccount(createName.trim(), createPassword);
      setGeneratedMnemonic(mnemonic);
      setCreatedAddress(address);
      setSuccess(t('accountCreated', { address: `${address.slice(0, 8)}...${address.slice(-6)}` }));
      await loadAccounts();
    } catch (err) {
      console.error('Create account error:', err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [createName, createPassword, loadAccounts]);

  // Import account
  const handleImport = useCallback(async () => {
    if (!importMnemonic.trim() || !importName.trim() || !importPassword) return;
    clearState();
    setLoading(true);
    try {
      const dk = await import('@/lib/wallet/desktop-keyring');
      const pwd = importPassword;
      const { address } = await dk.importAccount(importMnemonic.trim(), importName.trim(), pwd);
      setSuccess(t('accountImported', { address: `${address.slice(0, 8)}...${address.slice(-6)}` }));
      resetImportForm();
      await loadAccounts();

      // Auto unlock & connect, then close dialog
      try {
        await unlockDesktopAccount(address, pwd);
        const accs = await getAccounts();
        const account = accs.find((a) => a.address === address);
        if (account) {
          await connect(account);
        }
        setTimeout(() => setOpen(false), 800);
      } catch {
        // unlock failed — dialog stays open so user can manually unlock
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg === 'Invalid mnemonic phrase' ? t('invalidMnemonic') : t('importFailed'));
    } finally {
      setLoading(false);
    }
  }, [importMnemonic, importName, importPassword, loadAccounts]);

  // Unlock & connect
  const handleUnlock = useCallback(async () => {
    if (!selectedAddress || !unlockPassword) return;
    clearState();
    setLoading(true);
    try {
      await unlockDesktopAccount(selectedAddress, unlockPassword);
      const account = existingAccounts.find((a) => a.address === selectedAddress);
      if (account) {
        await connect(account);
      }
      setSuccess(t('accountUnlocked'));
      setUnlockPassword('');
      setTimeout(() => setOpen(false), 800);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('unlockFailed'));
    } finally {
      setLoading(false);
    }
  }, [selectedAddress, unlockPassword, unlockDesktopAccount, existingAccounts, connect]);

  // Delete account
  const handleDelete = useCallback(
    async (address: string) => {
      clearState();
      try {
        const dk = await import('@/lib/wallet/desktop-keyring');
        await dk.deleteAccount(address);
        setSuccess(t('accountDeleted'));
        await loadAccounts();
        if (selectedAddress === address) setSelectedAddress(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : t('deleteFailed'));
      }
    },
    [loadAccounts, selectedAddress],
  );

  const shortenAddress = (addr: string) =>
    addr.length > 16 ? `${addr.slice(0, 8)}...${addr.slice(-6)}` : addr;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="w-full px-2">
          {isConnected ? t('manageDesktopWallet') : t('openDesktopWallet')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            {t('desktopWallet')}
          </DialogTitle>
        </DialogHeader>

        {/* Status messages */}
        {error && (
          <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="flex items-start gap-2 rounded-md bg-green-500/10 p-3 text-sm text-green-600 dark:text-green-400">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        <Tabs defaultValue="unlock" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="unlock">
              <Unlock className="mr-1 h-3 w-3" />
              {t('unlock')}
            </TabsTrigger>
            <TabsTrigger value="create">
              <Plus className="mr-1 h-3 w-3" />
              {t('createTab')}
            </TabsTrigger>
            <TabsTrigger value="import">
              <Download className="mr-1 h-3 w-3" />
              {t('importTab')}
            </TabsTrigger>
          </TabsList>

          {/* Unlock Tab */}
          <TabsContent value="unlock" className="space-y-4">
            {existingAccounts.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                {t('noAccounts')}
              </p>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>{t('selectAccount')}</Label>
                  <div className="space-y-1.5 rounded-md border p-2">
                    {existingAccounts.map((acc) => (
                      <div
                        key={acc.address}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedAddress(acc.address)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelectedAddress(acc.address); }}
                        className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors cursor-pointer ${
                          selectedAddress === acc.address
                            ? 'bg-primary/10 text-primary'
                            : 'hover:bg-accent'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-medium">{acc.meta.name}</p>
                          <p className="truncate font-mono text-xs text-muted-foreground">
                            {shortenAddress(acc.address)}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          {selectedAddress === acc.address && (
                            <Badge variant="default" className="text-[10px]">
                              {t('selected')}
                            </Badge>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(acc.address);
                            }}
                            className="rounded p-1 text-muted-foreground hover:text-destructive"
                            title={t('deleteAccount')}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {selectedAddress && (
                  <div className="space-y-2">
                    <Label htmlFor="unlock-password">{t('password')}</Label>
                    <Input
                      id="unlock-password"
                      type="password"
                      placeholder={t('passwordPlaceholder')}
                      value={unlockPassword}
                      onChange={(e) => setUnlockPassword(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
                    />
                    <Button
                      onClick={handleUnlock}
                      disabled={!unlockPassword || loading}
                      className="w-full"
                    >
                      {loading ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Unlock className="mr-2 h-4 w-4" />
                      )}
                      {t('unlockAndConnect')}
                    </Button>
                  </div>
                )}
              </>
            )}
          </TabsContent>

          {/* Create Tab */}
          <TabsContent value="create" className="space-y-4">
            {generatedMnemonic ? (
              verifyIndices ? (
                /* Mnemonic verification step — click to select */
                <div className="space-y-4">
                  <div className="space-y-1">
                    <Label>{t('verifyMnemonic')}</Label>
                    <p className="text-xs text-muted-foreground">
                      {t('verifyMnemonicDesc')}
                    </p>
                  </div>

                  {/* Slots: show the 3 positions to fill */}
                  <div className="space-y-2">
                    {verifyIndices.map((wordIdx, i) => (
                      <div
                        key={wordIdx}
                        className="flex items-center gap-2"
                      >
                        <span className="w-16 shrink-0 text-sm font-medium text-muted-foreground">
                          {t('wordN', { n: wordIdx + 1 })}
                        </span>
                        {verifySelections[i] ? (
                          <button
                            onClick={() => handleUnselectSlot(i)}
                            className="rounded-md border border-primary bg-primary/10 px-3 py-1.5 font-mono text-sm text-primary transition-colors hover:bg-primary/20"
                          >
                            {verifySelections[i]}
                            <span className="ml-1.5 text-xs text-muted-foreground">✕</span>
                          </button>
                        ) : (
                          <div className={`flex h-8 w-28 items-center justify-center rounded-md border-2 border-dashed text-xs text-muted-foreground ${
                            nextEmptySlot === i ? 'border-primary/50 bg-primary/5' : 'border-muted'
                          }`}>
                            {nextEmptySlot === i ? t('pleaseSelect') : '—'}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Candidate word buttons */}
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">{t('candidateWords')}</Label>
                    <div className="flex flex-wrap gap-2">
                      {shuffledCandidates.map((word) => {
                        const used = selectedWords.has(word);
                        return (
                          <button
                            key={word}
                            onClick={() => !used && handleSelectWord(word)}
                            disabled={used || nextEmptySlot === -1}
                            className={`rounded-md border px-3 py-1.5 font-mono text-sm transition-colors ${
                              used
                                ? 'border-transparent bg-muted/30 text-muted-foreground/40 line-through'
                                : 'border-border bg-background hover:border-primary hover:bg-primary/5 hover:text-primary'
                            }`}
                          >
                            {word}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {verifyError && (
                    <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>{verifyError}</span>
                    </div>
                  )}
                  <Button
                    onClick={handleVerifyMnemonic}
                    disabled={verifySelections.some((s) => s === null)}
                    className="w-full"
                  >
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    {t('verify')}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setVerifyIndices(null);
                      setVerifySelections([null, null, null]);
                      setShuffledCandidates([]);
                      setVerifyError(null);
                    }}
                    className="w-full"
                  >
                    {t('backToMnemonic')}
                  </Button>
                </div>
              ) : (
                /* Mnemonic display step */
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>{t('mnemonicLabel')}</Label>
                    <div className="relative rounded-md border bg-muted/50 p-3">
                      <p className="break-all font-mono text-sm leading-relaxed">
                        {generatedMnemonic}
                      </p>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="absolute right-1 top-1"
                        onClick={() => navigator.clipboard.writeText(generatedMnemonic)}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <p className="text-xs text-destructive">
                      {t('mnemonicWarning')}
                    </p>
                  </div>
                  <Button
                    onClick={startMnemonicVerification}
                    className="w-full"
                  >
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    {t('mnemonicSaved')}
                  </Button>
                </div>
              )
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="create-name">{t('accountName')}</Label>
                  <Input
                    id="create-name"
                    placeholder={t('accountNamePlaceholder')}
                    value={createName}
                    onChange={(e) => setCreateName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="create-password">{t('passwordLabel')}</Label>
                  <Input
                    id="create-password"
                    type="password"
                    placeholder={t('passwordSetPlaceholder')}
                    value={createPassword}
                    onChange={(e) => setCreatePassword(e.target.value)}
                  />
                </div>
                <Button
                  onClick={handleCreate}
                  disabled={!createName.trim() || !createPassword || loading}
                  className="w-full"
                >
                  {loading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="mr-2 h-4 w-4" />
                  )}
                  {t('createAccount')}
                </Button>
              </>
            )}
          </TabsContent>

          {/* Import Tab */}
          <TabsContent value="import" className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="import-mnemonic">{t('mnemonicInput')}</Label>
              <Input
                id="import-mnemonic"
                placeholder={t('mnemonicInputPlaceholder')}
                value={importMnemonic}
                onChange={(e) => setImportMnemonic(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="import-name">{t('accountName')}</Label>
              <Input
                id="import-name"
                placeholder={t('accountNamePlaceholder')}
                value={importName}
                onChange={(e) => setImportName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="import-password">{t('passwordLabel')}</Label>
              <Input
                id="import-password"
                type="password"
                placeholder={t('passwordSetPlaceholder')}
                value={importPassword}
                onChange={(e) => setImportPassword(e.target.value)}
              />
            </div>
            <Button
              onClick={handleImport}
              disabled={!importMnemonic.trim() || !importName.trim() || !importPassword || loading}
              className="w-full"
            >
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              {t('importAccount')}
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
