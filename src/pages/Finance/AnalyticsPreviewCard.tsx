import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../store/AppContext';
import { CURRENCY_SYMBOLS } from '../../types';
import { isThisMonth } from '../../utils/date';
import './AnalyticsPreviewCard.css';

export function AnalyticsPreviewCard() {
  const navigate = useNavigate();
  const { state } = useApp();

  const getTxCurrency = (walletId: string) =>
    state.wallets.find(w => w.id === walletId)?.currency ?? 'RUB';

  const formatMoney = (amount: number, currency: string = 'RUB') => {
    const symbol = CURRENCY_SYMBOLS[currency as keyof typeof CURRENCY_SYMBOLS] || '₽';
    return (
      new Intl.NumberFormat('ru-RU', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }).format(amount) +
      ' ' +
      symbol
    );
  };

  const monthByCurrency = useMemo(() => {
    const income: Record<string, number> = {};
    const expense: Record<string, number> = {};
    state.transactions
      .filter(t => isThisMonth(t.date))
      .forEach(t => {
        const c = getTxCurrency(t.walletId);
        if (t.type === 'income') {
          income[c] = (income[c] ?? 0) + t.amount;
        } else if (t.type === 'expense') {
          expense[c] = (expense[c] ?? 0) + t.amount;
        } else if (t.type === 'transfer') {
          expense[c] = (expense[c] ?? 0) + t.amount;
          if (t.toWalletId) {
            const toCur = getTxCurrency(t.toWalletId);
            const toAmt = t.toAmount ?? t.amount;
            income[toCur] = (income[toCur] ?? 0) + toAmt;
          }
        }
      });
    const all = [...new Set([...Object.keys(income), ...Object.keys(expense)])].sort();
    const net: Record<string, number> = {};
    all.forEach(cur => {
      net[cur] = (income[cur] ?? 0) - (expense[cur] ?? 0);
    });
    return { income, expense, net, allCurrencies: all };
  }, [state.transactions, state.wallets]);

  const monthNet =
    Object.values(monthByCurrency.income).reduce((a, b) => a + b, 0) -
    Object.values(monthByCurrency.expense).reduce((a, b) => a + b, 0);
  const primaryCur = monthByCurrency.allCurrencies[0] ?? 'RUB';
  const primaryInc = monthByCurrency.income[primaryCur] ?? 0;
  const primaryExp = monthByCurrency.expense[primaryCur] ?? 0;
  const expenseRatio =
    primaryInc > 0 ? Math.min(100, Math.round((primaryExp / primaryInc) * 100)) : 0;

  const formatIncomePreview = () =>
    monthByCurrency.allCurrencies
      .filter(c => (monthByCurrency.income[c] ?? 0) !== 0)
      .map(c => '+' + formatMoney(monthByCurrency.income[c] ?? 0, c))
      .join(', ') || '—';

  const formatExpensePreview = () =>
    monthByCurrency.allCurrencies
      .filter(c => (monthByCurrency.expense[c] ?? 0) !== 0)
      .map(c => '−' + formatMoney(monthByCurrency.expense[c] ?? 0, c))
      .join(', ') || '—';

  const formatNetPreview = () =>
    monthByCurrency.allCurrencies
      .filter(c => (monthByCurrency.net[c] ?? 0) !== 0)
      .map(c => {
        const v = monthByCurrency.net[c] ?? 0;
        return (v >= 0 ? '+' : '') + formatMoney(v, c);
      })
      .join(', ') || '—';

  const topCategories = useMemo(() => {
    const categoryTotals: Record<string, number> = {};
    state.transactions
      .filter(t => (t.type === 'expense' || t.type === 'transfer') && isThisMonth(t.date))
      .forEach(t => {
        categoryTotals[t.category] = (categoryTotals[t.category] || 0) + t.amount;
      });
    return Object.entries(categoryTotals)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3);
  }, [state.transactions]);

  return (
    <div
      className="analytics-preview-card"
      onClick={() => navigate('/finance/analytics')}
    >
      <div className="analytics-preview-header">
        <h3>Аналитика за месяц</h3>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="analytics-arrow"
        >
          <path d="M9 18l6-6-6-6" />
        </svg>
      </div>

      <div className="analytics-preview-stats">
        <div className="preview-stat income">
          <span className="preview-stat-label">Доходы</span>
          <span className="preview-stat-value">{formatIncomePreview()}</span>
        </div>
        <div className="preview-stat expense">
          <span className="preview-stat-label">Расходы</span>
          <span className="preview-stat-value">{formatExpensePreview()}</span>
        </div>
        <div className={`preview-stat net ${monthNet >= 0 ? 'positive' : 'negative'}`}>
          <span className="preview-stat-label">Итог</span>
          <span className="preview-stat-value">{formatNetPreview()}</span>
        </div>
      </div>

      <div className="analytics-preview-bar">
        <div className="preview-bar-fill" style={{ width: `${expenseRatio}%` }} />
      </div>
      <span className="preview-bar-label">{expenseRatio}% доходов потрачено</span>

      {topCategories.length > 0 && (
        <div className="preview-top-category">
          <span className="preview-top-label">Главная категория:</span>
          <span className="preview-top-value">{topCategories[0][0]}</span>
        </div>
      )}
    </div>
  );
}
