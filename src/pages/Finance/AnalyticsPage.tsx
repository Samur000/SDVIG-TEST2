import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../../components/Layout';
import { Modal } from '../../components/Modal';
import { useApp } from '../../store/AppContext';
import { CURRENCY_SYMBOLS } from '../../types';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line, Doughnut } from 'react-chartjs-2';
import './AnalyticsPage.css';

// Регистрация компонентов Chart.js
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

// Типы периодов
type PeriodType = 'week' | 'month' | 'year' | 'all';
type PeriodRange = 'current' | 'previous' | 'custom';
type ViewMode = 'all' | 'income' | 'expense';

export function AnalyticsPage() {
  const navigate = useNavigate();
  const { state } = useApp();
  
  // Состояния
  const [periodType, setPeriodType] = useState<PeriodType>('month');
  const [periodRange, setPeriodRange] = useState<PeriodRange>('current');
  const [viewMode, setViewMode] = useState<ViewMode>('all');
  const [selectedWallets, setSelectedWallets] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'date-desc' | 'date-asc' | 'amount-desc' | 'amount-asc'>('date-desc');
  
  // Вычисление дат периода
  const { startDate, endDate, prevStartDate, prevEndDate } = useMemo(() => {
    const now = new Date();
    let start: Date, end: Date, prevStart: Date, prevEnd: Date;
    
    if (periodType === 'week') {
      const dayOfWeek = now.getDay();
      const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      start = new Date(now);
      start.setDate(now.getDate() - diff);
      start.setHours(0, 0, 0, 0);
      end = new Date(start);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      
      prevStart = new Date(start);
      prevStart.setDate(prevStart.getDate() - 7);
      prevEnd = new Date(end);
      prevEnd.setDate(prevEnd.getDate() - 7);
    } else if (periodType === 'month') {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      
      prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      prevEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    } else if (periodType === 'year') {
      start = new Date(now.getFullYear(), 0, 1);
      end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
      
      prevStart = new Date(now.getFullYear() - 1, 0, 1);
      prevEnd = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
    } else {
      start = new Date(0);
      end = new Date();
      prevStart = new Date(0);
      prevEnd = new Date(0);
    }
    
    if (periodRange === 'previous') {
      return { startDate: prevStart, endDate: prevEnd, prevStartDate: new Date(0), prevEndDate: new Date(0) };
    }
    
    return { startDate: start, endDate: end, prevStartDate: prevStart, prevEndDate: prevEnd };
  }, [periodType, periodRange]);
  
  // Фильтрация транзакций
  const filteredTransactions = useMemo(() => {
    return state.transactions.filter(tx => {
      const txDate = new Date(tx.date);
      if (txDate < startDate || txDate > endDate) return false;
      if (selectedWallets.length > 0 && !selectedWallets.includes(tx.walletId)) return false;
      if (viewMode === 'income' && tx.type !== 'income') return false;
      if (viewMode === 'expense' && tx.type !== 'expense') return false;
      return true;
    });
  }, [state.transactions, startDate, endDate, selectedWallets, viewMode]);
  
  // Транзакции предыдущего периода
  const prevTransactions = useMemo(() => {
    if (periodType === 'all') return [];
    return state.transactions.filter(tx => {
      const txDate = new Date(tx.date);
      if (txDate < prevStartDate || txDate > prevEndDate) return false;
      if (selectedWallets.length > 0 && !selectedWallets.includes(tx.walletId)) return false;
      return true;
    });
  }, [state.transactions, prevStartDate, prevEndDate, selectedWallets, periodType]);
  
  // Суммы
  const totals = useMemo(() => {
    const income = filteredTransactions
      .filter(tx => tx.type === 'income')
      .reduce((sum, tx) => sum + tx.amount, 0);
    const expense = filteredTransactions
      .filter(tx => tx.type === 'expense')
      .reduce((sum, tx) => sum + tx.amount, 0);
    return { income, expense, net: income - expense };
  }, [filteredTransactions]);
  
  const prevTotals = useMemo(() => {
    const income = prevTransactions
      .filter(tx => tx.type === 'income')
      .reduce((sum, tx) => sum + tx.amount, 0);
    const expense = prevTransactions
      .filter(tx => tx.type === 'expense')
      .reduce((sum, tx) => sum + tx.amount, 0);
    return { income, expense, net: income - expense };
  }, [prevTransactions]);
  
  // Изменение в процентах
  const changes = useMemo(() => {
    const calcChange = (current: number, prev: number) => {
      if (prev === 0) return current > 0 ? 100 : 0;
      return Math.round(((current - prev) / prev) * 100);
    };
    return {
      income: calcChange(totals.income, prevTotals.income),
      expense: calcChange(totals.expense, prevTotals.expense),
    };
  }, [totals, prevTotals]);
  
  // Категории расходов
  const expensesByCategory = useMemo(() => {
    const categories: Record<string, number> = {};
    filteredTransactions
      .filter(tx => tx.type === 'expense')
      .forEach(tx => {
        categories[tx.category] = (categories[tx.category] || 0) + tx.amount;
      });
    return Object.entries(categories)
      .sort(([, a], [, b]) => b - a)
      .map(([name, amount]) => ({
        name,
        amount,
        percent: totals.expense > 0 ? Math.round((amount / totals.expense) * 100) : 0
      }));
  }, [filteredTransactions, totals.expense]);
  
  // Данные для графика по времени
  const chartData = useMemo(() => {
    const now = new Date();
    now.setHours(23, 59, 59, 999);

    // Для "всё время": период = с первой операции по сей день
    let chartStart = startDate;
    let chartEnd = endDate;
    if (periodType === 'all' && filteredTransactions.length > 0) {
      const firstDateStr = filteredTransactions.reduce((min, tx) => (tx.date < min ? tx.date : min), filteredTransactions[0].date);
      chartStart = new Date(firstDateStr);
      chartStart.setHours(0, 0, 0, 0);
      chartEnd = new Date(now);
    }

    // Режим группировки: год — по месяцам; "всё время" — по длительности с первой операции
    const daysSinceFirst = Math.ceil((chartEnd.getTime() - chartStart.getTime()) / (1000 * 60 * 60 * 24));
    const allTimeByMonth = periodType === 'all' && daysSinceFirst >= 30;
    const shouldGroupByMonth = periodType === 'year' || (periodType === 'all' && allTimeByMonth);

    if (shouldGroupByMonth) {
      const monthsData: Record<string, { income: number; expense: number }> = {};

      if (periodType === 'year') {
        const year = startDate.getFullYear();
        for (let m = 0; m < 12; m++) {
          const key = `${year}-${String(m + 1).padStart(2, '0')}`;
          monthsData[key] = { income: 0, expense: 0 };
        }
      } else {
        // "Всё время": от первого дня первой операции до конца текущего месяца
        const current = new Date(chartStart.getFullYear(), chartStart.getMonth(), 1);
        const endMonth = new Date(chartEnd.getFullYear(), chartEnd.getMonth() + 1, 0);
        while (current <= endMonth) {
          const key = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`;
          monthsData[key] = { income: 0, expense: 0 };
          current.setMonth(current.getMonth() + 1);
        }
      }

      filteredTransactions.forEach(tx => {
        const txDate = new Date(tx.date);
        const key = `${txDate.getFullYear()}-${String(txDate.getMonth() + 1).padStart(2, '0')}`;
        if (monthsData[key]) {
          if (tx.type === 'income') monthsData[key].income += tx.amount;
          else if (tx.type === 'expense') monthsData[key].expense += tx.amount;
        }
      });

      const sortedMonths = Object.keys(monthsData).sort();
      const labels = sortedMonths.map(m => {
        const [y, mo] = m.split('-');
        const d = new Date(parseInt(y), parseInt(mo) - 1, 1);
        return d.toLocaleDateString('ru-RU', { month: 'short', year: periodType === 'all' ? '2-digit' : undefined });
      });

      return {
        labels,
        datasets: [
          { label: 'Доходы', data: sortedMonths.map(m => monthsData[m].income), borderColor: '#10B981', backgroundColor: 'rgba(16, 185, 129, 0.1)', fill: true, tension: 0.4, pointRadius: 3, pointHoverRadius: 6 },
          { label: 'Расходы', data: sortedMonths.map(m => monthsData[m].expense), borderColor: '#EF4444', backgroundColor: 'rgba(239, 68, 68, 0.1)', fill: true, tension: 0.4, pointRadius: 3, pointHoverRadius: 6 },
        ],
      };
    }

    // По дням: неделя, месяц или "всё время" с первой операции, если прошло < 30 дней
    const daysInPeriod: Record<string, { income: number; expense: number }> = {};
    const current = new Date(chartStart);
    current.setHours(0, 0, 0, 0);
    const end = new Date(chartEnd);
    end.setHours(23, 59, 59, 999);

    while (current <= end) {
      const dateStr = current.toISOString().split('T')[0];
      daysInPeriod[dateStr] = { income: 0, expense: 0 };
      current.setDate(current.getDate() + 1);
    }

    filteredTransactions.forEach(tx => {
      const dateStr = tx.date;
      if (daysInPeriod[dateStr]) {
        if (tx.type === 'income') daysInPeriod[dateStr].income += tx.amount;
        else if (tx.type === 'expense') daysInPeriod[dateStr].expense += tx.amount;
      }
    });

    const sortedDates = Object.keys(daysInPeriod).sort();
    const labels = sortedDates.map(d => {
      const date = new Date(d);
      return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
    });

    return {
      labels,
      datasets: [
        { label: 'Доходы', data: sortedDates.map(d => daysInPeriod[d].income), borderColor: '#10B981', backgroundColor: 'rgba(16, 185, 129, 0.1)', fill: true, tension: 0.4, pointRadius: 3, pointHoverRadius: 6 },
        { label: 'Расходы', data: sortedDates.map(d => daysInPeriod[d].expense), borderColor: '#EF4444', backgroundColor: 'rgba(239, 68, 68, 0.1)', fill: true, tension: 0.4, pointRadius: 3, pointHoverRadius: 6 },
      ],
    };
  }, [filteredTransactions, startDate, endDate, periodType]);
  
  // Опции графика
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top' as const,
        labels: {
          usePointStyle: true,
          padding: 16,
          font: { size: 12 }
        }
      },
      tooltip: {
        mode: 'index' as const,
        intersect: false,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        padding: 12,
        cornerRadius: 8,
      }
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { font: { size: 10 } }
      },
      y: {
        beginAtZero: true,
        grid: { color: 'rgba(0, 0, 0, 0.05)' },
        ticks: { font: { size: 10 } }
      }
    },
    interaction: {
      mode: 'nearest' as const,
      axis: 'x' as const,
      intersect: false
    }
  };
  
  // Данные для кольцевой диаграммы категорий
  const categoryChartColors = [
    '#6366F1', '#8B5CF6', '#EC4899', '#EF4444',
    '#F59E0B', '#10B981', '#14B8A6', '#3B82F6',
    '#84CC16', '#06B6D4'
  ];
  
  const doughnutData = useMemo(() => ({
    labels: expensesByCategory.slice(0, 8).map(c => c.name),
    datasets: [{
      data: expensesByCategory.slice(0, 8).map(c => c.amount),
      backgroundColor: categoryChartColors.slice(0, 8),
      borderWidth: 0,
      hoverOffset: 8
    }]
  }), [expensesByCategory]);
  
  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '65%',
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        padding: 12,
        cornerRadius: 8,
      }
    }
  };
  
  // Изменения по счетам за период
  const walletChanges = useMemo(() => {
    const changes: Record<string, { income: number; expense: number; net: number }> = {};
    
    state.wallets.forEach(wallet => {
      changes[wallet.id] = { income: 0, expense: 0, net: 0 };
    });
    
    filteredTransactions.forEach(tx => {
      if (!changes[tx.walletId]) return;
      if (tx.type === 'income') {
        changes[tx.walletId].income += tx.amount;
        changes[tx.walletId].net += tx.amount;
      } else if (tx.type === 'expense') {
        changes[tx.walletId].expense += tx.amount;
        changes[tx.walletId].net -= tx.amount;
      }
    });
    
    return changes;
  }, [state.wallets, filteredTransactions]);
  
  // Самый затратный день
  const mostExpensiveDay = useMemo(() => {
    const byDay: Record<string, number> = {};
    filteredTransactions
      .filter(tx => tx.type === 'expense')
      .forEach(tx => {
        byDay[tx.date] = (byDay[tx.date] || 0) + tx.amount;
      });
    const sorted = Object.entries(byDay).sort(([, a], [, b]) => b - a);
    if (sorted.length === 0) return null;
    const [date, amount] = sorted[0];
    return { date: new Date(date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }), amount };
  }, [filteredTransactions]);
  
  // Форматирование денег (определено раньше для использования в insights)
  const formatMoney = (amount: number, currency: string = 'RUB') => {
    const symbol = CURRENCY_SYMBOLS[currency as keyof typeof CURRENCY_SYMBOLS] || '₽';
    return new Intl.NumberFormat('ru-RU', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount) + ' ' + symbol;
  };
  
  // Автоматические инсайты
  const insights = useMemo(() => {
    const list: { type: 'info' | 'positive' | 'warning'; text: string }[] = [];
    
    // Главная категория расходов
    if (expensesByCategory[0]) {
      list.push({
        type: 'info',
        text: `Главная категория расходов — ${expensesByCategory[0].name} (${expensesByCategory[0].percent}% от всех расходов)`
      });
    }
    
    // Баланс
    if (totals.net > 0) {
      list.push({
        type: 'positive',
        text: `Вы сэкономили ${formatMoney(totals.net)} за этот период`
      });
    } else if (totals.net < 0) {
      list.push({
        type: 'warning',
        text: `Расходы превышают доходы на ${formatMoney(Math.abs(totals.net))}`
      });
    }
    
    // Рост расходов
    if (periodType !== 'all' && changes.expense > 20) {
      list.push({
        type: 'warning',
        text: `Расходы выросли на ${changes.expense}% по сравнению с прошлым периодом`
      });
    }
    
    // Снижение расходов
    if (periodType !== 'all' && changes.expense < -10) {
      list.push({
        type: 'positive',
        text: `Расходы снизились на ${Math.abs(changes.expense)}% по сравнению с прошлым периодом`
      });
    }
    
    // Рост доходов
    if (periodType !== 'all' && changes.income > 20) {
      list.push({
        type: 'positive',
        text: `Доходы выросли на ${changes.income}% — отличная динамика!`
      });
    }
    
    // Процент потраченного
    if (totals.income > 0) {
      const spentRatio = Math.round((totals.expense / totals.income) * 100);
      if (spentRatio > 90) {
        list.push({
          type: 'warning',
          text: `Вы потратили ${spentRatio}% от доходов — стоит обратить внимание на расходы`
        });
      } else if (spentRatio < 50) {
        list.push({
          type: 'positive',
          text: `Вы потратили только ${spentRatio}% от доходов — хорошая экономия!`
        });
      }
    }
    
    // Самый затратный день
    if (mostExpensiveDay && mostExpensiveDay.amount > totals.expense * 0.2) {
      list.push({
        type: 'info',
        text: `Самый затратный день: ${mostExpensiveDay.date} — ${formatMoney(mostExpensiveDay.amount)}`
      });
    }
    
    // Категории без операций
    if (expensesByCategory.length === 0 && filteredTransactions.length > 0) {
      list.push({
        type: 'info',
        text: 'Все операции за период — доходы. Расходов нет.'
      });
    }
    
    return list.slice(0, 5); // Не более 5 инсайтов
  }, [expensesByCategory, totals, changes, periodType, mostExpensiveDay, filteredTransactions]);
  
  // Процент расходов от доходов
  const expenseRatio = totals.income > 0 
    ? Math.min(100, Math.round((totals.expense / totals.income) * 100))
    : 0;
  
  // Поиск и сортировка транзакций для списка
  const displayedTransactions = useMemo(() => {
    let txs = [...filteredTransactions];
    
    // Поиск
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      txs = txs.filter(tx => 
        tx.category.toLowerCase().includes(query) ||
        (tx.comment && tx.comment.toLowerCase().includes(query)) ||
        tx.amount.toString().includes(query)
      );
    }
    
    // Сортировка
    txs.sort((a, b) => {
      switch (sortOrder) {
        case 'date-desc':
          return b.date.localeCompare(a.date);
        case 'date-asc':
          return a.date.localeCompare(b.date);
        case 'amount-desc':
          return b.amount - a.amount;
        case 'amount-asc':
          return a.amount - b.amount;
        default:
          return 0;
      }
    });
    
    return txs;
  }, [filteredTransactions, searchQuery, sortOrder]);
  
  // Мини-итог по отфильтрованному списку
  const displayedTotals = useMemo(() => {
    const income = displayedTransactions.filter(tx => tx.type === 'income').reduce((s, tx) => s + tx.amount, 0);
    const expense = displayedTransactions.filter(tx => tx.type === 'expense').reduce((s, tx) => s + tx.amount, 0);
    return { count: displayedTransactions.length, income, expense, net: income - expense };
  }, [displayedTransactions]);
  
  // Данные для модального окна категории
  const categoryDetails = useMemo(() => {
    if (!selectedCategory) return null;
    
    const categoryTxs = filteredTransactions.filter(
      tx => tx.category === selectedCategory && tx.type === 'expense'
    );
    
    const total = categoryTxs.reduce((sum, tx) => sum + tx.amount, 0);
    const count = categoryTxs.length;
    const avgCheck = count > 0 ? total / count : 0;
    const percent = totals.expense > 0 ? Math.round((total / totals.expense) * 100) : 0;
    
    // Подсчёт частоты
    const uniqueDays = new Set(categoryTxs.map(tx => tx.date)).size;
    const periodDays = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
    const frequencyPerWeek = Math.round((uniqueDays / periodDays) * 7 * 10) / 10;
    
    // Сравнение с прошлым периодом
    const prevCategoryTxs = prevTransactions.filter(
      tx => tx.category === selectedCategory && tx.type === 'expense'
    );
    const prevTotal = prevCategoryTxs.reduce((sum, tx) => sum + tx.amount, 0);
    const change = prevTotal > 0 ? Math.round(((total - prevTotal) / prevTotal) * 100) : (total > 0 ? 100 : 0);
    
    return {
      name: selectedCategory,
      total,
      count,
      avgCheck,
      percent,
      frequencyPerWeek,
      change,
      transactions: categoryTxs.slice(0, 10)
    };
  }, [selectedCategory, filteredTransactions, prevTransactions, totals.expense, startDate, endDate]);

  return (
    <Layout 
      title="Аналитика"
      headerLeft={
        <button className="header-back-btn" onClick={() => navigate('/finance')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6"/>
          </svg>
        </button>
      }
    >
      <div className="analytics-page">
        {/* Верхний блок - сводка периода */}
        <div className="analytics-header">
          {/* Выбор периода */}
          <div className="period-selector">
            <div className="period-tabs">
              {(['week', 'month', 'year', 'all'] as PeriodType[]).map(p => (
                <button
                  key={p}
                  className={`period-tab ${periodType === p ? 'active' : ''}`}
                  onClick={() => setPeriodType(p)}
                >
                  {p === 'week' && 'Неделя'}
                  {p === 'month' && 'Месяц'}
                  {p === 'year' && 'Год'}
                  {p === 'all' && 'Всё время'}
                </button>
              ))}
            </div>
            
            {periodType !== 'all' && (
              <div className="period-range">
                <button
                  className={`range-btn ${periodRange === 'current' ? 'active' : ''}`}
                  onClick={() => setPeriodRange('current')}
                >
                  Текущий
                </button>
                <button
                  className={`range-btn ${periodRange === 'previous' ? 'active' : ''}`}
                  onClick={() => setPeriodRange('previous')}
                >
                  Предыдущий
                </button>
              </div>
            )}
          </div>
          
          {/* Сводка */}
          <div className="summary-block">
            <div className="summary-item income">
              <span className="summary-label">Доходы</span>
              <span className="summary-value">{formatMoney(totals.income)}</span>
              {periodType !== 'all' && changes.income !== 0 && (
                <span className={`summary-change ${changes.income >= 0 ? 'positive' : 'negative'}`}>
                  {changes.income >= 0 ? '+' : ''}{changes.income}%
                </span>
              )}
            </div>
            
            <div className="summary-item expense">
              <span className="summary-label">Расходы</span>
              <span className="summary-value">{formatMoney(totals.expense)}</span>
              {periodType !== 'all' && changes.expense !== 0 && (
                <span className={`summary-change ${changes.expense <= 0 ? 'positive' : 'negative'}`}>
                  {changes.expense >= 0 ? '+' : ''}{changes.expense}%
                </span>
              )}
            </div>
            
            <div className={`summary-item net ${totals.net >= 0 ? 'positive' : 'negative'}`}>
              <span className="summary-label">Итог</span>
              <span className="summary-value">
                {totals.net >= 0 ? '+' : ''}{formatMoney(totals.net)}
              </span>
            </div>
          </div>
          
          {/* Шкала */}
          <div className="ratio-bar">
            <div className="ratio-bar-fill" style={{ width: `${expenseRatio}%` }} />
            <span className="ratio-bar-label">
              {expenseRatio}% доходов потрачено
            </span>
          </div>
        </div>
        
        {/* Фильтры */}
        <div className="filters-panel">
          <div className="view-mode-tabs">
            {(['all', 'income', 'expense'] as ViewMode[]).map(mode => (
              <button
                key={mode}
                className={`view-mode-tab ${viewMode === mode ? 'active' : ''}`}
                onClick={() => setViewMode(mode)}
              >
                {mode === 'all' && 'Все'}
                {mode === 'income' && 'Доходы'}
                {mode === 'expense' && 'Расходы'}
              </button>
            ))}
          </div>
          
          <div className="wallet-chips">
            <button
              className={`wallet-chip ${selectedWallets.length === 0 ? 'active' : ''}`}
              onClick={() => setSelectedWallets([])}
            >
              Все счета
            </button>
            {state.wallets.map(wallet => (
              <button
                key={wallet.id}
                className={`wallet-chip ${selectedWallets.includes(wallet.id) ? 'active' : ''}`}
                style={{ '--chip-color': wallet.color } as React.CSSProperties}
                onClick={() => {
                  if (selectedWallets.includes(wallet.id)) {
                    setSelectedWallets(selectedWallets.filter(id => id !== wallet.id));
                  } else {
                    setSelectedWallets([...selectedWallets, wallet.id]);
                  }
                }}
              >
                {wallet.name}
              </button>
            ))}
          </div>
        </div>
        
        {/* График динамики */}
        <div className="analytics-card chart-card">
          <h3 className="card-title">Динамика по времени</h3>
          <div className="chart-container">
            <Line data={chartData} options={chartOptions} />
          </div>
          {mostExpensiveDay && (
            <div className="chart-insight">
              <span className="insight-icon">📊</span>
              <span>Самый затратный день: <strong>{mostExpensiveDay.date}</strong> — {formatMoney(mostExpensiveDay.amount)}</span>
            </div>
          )}
        </div>
        
        {/* Блок категорий с диаграммой */}
        <div className="analytics-card">
          <h3 className="card-title">Расходы по категориям</h3>
          
          {expensesByCategory.length === 0 ? (
            <div className="empty-state">Нет данных за выбранный период</div>
          ) : (
            <>
              <div className="category-chart-container">
                <div className="doughnut-wrapper">
                  <Doughnut data={doughnutData} options={doughnutOptions} />
                  <div className="doughnut-center">
                    <span className="doughnut-total">{formatMoney(totals.expense)}</span>
                    <span className="doughnut-label">{expensesByCategory.length} категорий</span>
                  </div>
                </div>
              </div>
              
              <div className="categories-list">
                {expensesByCategory.map((cat, index) => (
                  <div 
                    key={cat.name} 
                    className="category-row clickable"
                    onClick={() => setSelectedCategory(cat.name)}
                  >
                    <div 
                      className="category-color-dot"
                      style={{ backgroundColor: categoryChartColors[index % categoryChartColors.length] }}
                    />
                    <div className="category-info">
                      <span className="category-name">{cat.name}</span>
                      <span className="category-percent">{cat.percent}%</span>
                    </div>
                    <div className="category-bar">
                      <div 
                        className="category-bar-fill" 
                        style={{ 
                          width: `${cat.percent}%`,
                          background: categoryChartColors[index % categoryChartColors.length]
                        }}
                      />
                    </div>
                    <span className="category-amount">{formatMoney(cat.amount)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
        
        {/* Блок счетов */}
        <div className="analytics-card">
          <h3 className="card-title">Баланс по счетам</h3>
          
          <div className="accounts-summary">
            <span className="accounts-summary-label">Всего на счетах</span>
            <span className="accounts-summary-value">
              {formatMoney(state.wallets.reduce((sum, w) => sum + w.balance, 0))}
            </span>
            <span className={`accounts-summary-change ${totals.net >= 0 ? 'positive' : 'negative'}`}>
              {totals.net >= 0 ? '+' : ''}{formatMoney(totals.net)} за период
            </span>
          </div>
          
          <div className="accounts-list enhanced">
            {state.wallets.map(wallet => {
              const change = walletChanges[wallet.id] || { income: 0, expense: 0, net: 0 };
              const maxChange = Math.max(change.income, change.expense, 1);
              return (
                <div key={wallet.id} className="account-row enhanced">
                  <div 
                    className="account-icon"
                    style={{ backgroundColor: wallet.color + '20', color: wallet.color }}
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                      <rect x="2" y="5" width="20" height="14" rx="2"/>
                    </svg>
                  </div>
                  <div className="account-info">
                    <span className="account-name">{wallet.name}</span>
                    <div className="account-change-bar">
                      <div 
                        className="change-bar income" 
                        style={{ width: `${(change.income / maxChange) * 50}%` }}
                      />
                      <div 
                        className="change-bar expense" 
                        style={{ width: `${(change.expense / maxChange) * 50}%` }}
                      />
                    </div>
                  </div>
                  <div className="account-values">
                    <span className="account-balance">{formatMoney(wallet.balance, wallet.currency)}</span>
                    {change.net !== 0 && (
                      <span className={`account-change ${change.net >= 0 ? 'positive' : 'negative'}`}>
                        {change.net >= 0 ? '+' : ''}{formatMoney(change.net, wallet.currency)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        
        {/* Детализация операций */}
        <div className="analytics-card transactions-card">
          <h3 className="card-title">Детализация операций</h3>
          
          {/* Поиск */}
          <div className="search-box">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="search-icon">
              <circle cx="11" cy="11" r="8"/>
              <path d="M21 21l-4.35-4.35"/>
            </svg>
            <input
              type="text"
              placeholder="Поиск по описанию, сумме, категории..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="search-input"
            />
            {searchQuery && (
              <button className="search-clear" onClick={() => setSearchQuery('')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            )}
          </div>
          
          {/* Сортировка */}
          <div className="sort-chips">
            <button
              className={`sort-chip ${sortOrder === 'date-desc' ? 'active' : ''}`}
              onClick={() => setSortOrder('date-desc')}
            >
              Новые
            </button>
            <button
              className={`sort-chip ${sortOrder === 'date-asc' ? 'active' : ''}`}
              onClick={() => setSortOrder('date-asc')}
            >
              Старые
            </button>
            <button
              className={`sort-chip ${sortOrder === 'amount-desc' ? 'active' : ''}`}
              onClick={() => setSortOrder('amount-desc')}
            >
              Сумма ↓
            </button>
            <button
              className={`sort-chip ${sortOrder === 'amount-asc' ? 'active' : ''}`}
              onClick={() => setSortOrder('amount-asc')}
            >
              Сумма ↑
            </button>
          </div>
          
          {/* Список операций */}
          <div className="transactions-full-list">
            {displayedTransactions.length === 0 ? (
              <div className="empty-state">Нет операций по заданным критериям</div>
            ) : (
              displayedTransactions.slice(0, 20).map(tx => {
                const wallet = state.wallets.find(w => w.id === tx.walletId);
                return (
                  <div key={tx.id} className="transaction-full-row">
                    <div className="tx-icon-wrap" style={{ backgroundColor: tx.type === 'income' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)' }}>
                      {tx.type === 'income' ? (
                        <svg viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2">
                          <path d="M12 19V5M5 12l7-7 7 7"/>
                        </svg>
                      ) : (
                        <svg viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2">
                          <path d="M12 5v14M19 12l-7 7-7-7"/>
                        </svg>
                      )}
                    </div>
                    <div className="tx-details">
                      <span className="tx-category-name">{tx.category}</span>
                      {tx.comment && <span className="tx-description">{tx.comment}</span>}
                    </div>
                    <div className="tx-meta">
                      <span className={`tx-amount-full ${tx.type}`}>
                        {tx.type === 'income' ? '+' : '-'}{formatMoney(tx.amount, wallet?.currency)}
                      </span>
                      <span className="tx-date-wallet">
                        {new Date(tx.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                        {wallet && ` · ${wallet.name}`}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
            {displayedTransactions.length > 20 && (
              <div className="more-transactions">
                И ещё {displayedTransactions.length - 20} операций
              </div>
            )}
          </div>
          
          {/* Мини-итог */}
          {displayedTransactions.length > 0 && (
            <div className="transactions-summary">
              <span>Операций: {displayedTotals.count}</span>
              <span className="summary-income">+{formatMoney(displayedTotals.income)}</span>
              <span className="summary-expense">-{formatMoney(displayedTotals.expense)}</span>
              <span className={`summary-net ${displayedTotals.net >= 0 ? 'positive' : 'negative'}`}>
                = {displayedTotals.net >= 0 ? '+' : ''}{formatMoney(displayedTotals.net)}
              </span>
            </div>
          )}
        </div>
        
        {/* Инсайты */}
        {insights.length > 0 && (
          <div className="analytics-card insights-card">
            <h3 className="card-title">
              <span className="insights-icon">💡</span>
              Инсайты и подсказки
            </h3>
            <ul className="insights-list">
              {insights.map((insight, index) => (
                <li key={index} className={`insight-${insight.type}`}>
                  {insight.text}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      
      {/* Модальное окно категории */}
      <Modal
        isOpen={!!selectedCategory && !!categoryDetails}
        onClose={() => setSelectedCategory(null)}
        title={categoryDetails?.name || ''}
      >
        {categoryDetails && (
          <div className="category-detail-modal">
            <div className="detail-summary">
              <div className="detail-main-value">
                <span className="detail-amount">{formatMoney(categoryDetails.total)}</span>
                <span className="detail-percent">{categoryDetails.percent}% от расходов</span>
              </div>
              
              <div className="detail-stats">
                <div className="detail-stat">
                  <span className="stat-value">{formatMoney(categoryDetails.avgCheck)}</span>
                  <span className="stat-label">Средний чек</span>
                </div>
                <div className="detail-stat">
                  <span className="stat-value">{categoryDetails.count}</span>
                  <span className="stat-label">Операций</span>
                </div>
                <div className="detail-stat">
                  <span className="stat-value">{categoryDetails.frequencyPerWeek}/нед</span>
                  <span className="stat-label">Частота</span>
                </div>
              </div>
              
              {periodType !== 'all' && (
                <div className={`detail-change ${categoryDetails.change >= 0 ? 'negative' : 'positive'}`}>
                  {categoryDetails.change >= 0 ? '↑' : '↓'} {Math.abs(categoryDetails.change)}% к прошлому периоду
                </div>
              )}
            </div>
            
            <div className="detail-transactions">
              <h4>Последние операции</h4>
              {categoryDetails.transactions.length === 0 ? (
                <div className="empty-state">Нет операций</div>
              ) : (
                <div className="detail-tx-list">
                  {categoryDetails.transactions.map(tx => {
                    const wallet = state.wallets.find(w => w.id === tx.walletId);
                    return (
                      <div key={tx.id} className="detail-tx-row">
                        <div className="detail-tx-info">
                          <span className="detail-tx-desc">{tx.comment || 'Без описания'}</span>
                          <span className="detail-tx-date">
                            {new Date(tx.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                            {wallet && ` · ${wallet.name}`}
                          </span>
                        </div>
                        <span className="detail-tx-amount">-{formatMoney(tx.amount, wallet?.currency)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </Layout>
  );
}
