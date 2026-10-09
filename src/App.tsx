import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, CreditCard, LayoutDashboard, LogOut, Plus, Search, Wallet } from 'lucide-react'
import { supabase, supabaseConfigured } from './lib/supabase'
import type { Category, EntryKind, Payer, Transaction } from './types'
import { yen } from './types'

type Tab = 'calendar' | 'entry' | 'search' | 'summary' | 'budget' | 'credit'
const today = new Date()
const localDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
const monthString = (d: Date) => localDate(new Date(d.getFullYear(), d.getMonth(), 1)).slice(0,7)
const initialMonth = monthString(today)

export default function App() {
  const [session, setSession] = useState<any>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [tab, setTab] = useState<Tab>('calendar')
  const [month, setMonth] = useState(initialMonth)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [householdId, setHouseholdId] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [searchText, setSearchText] = useState('')
  const [searchKind, setSearchKind] = useState<'all' | EntryKind>('all')
  const [searchPayer, setSearchPayer] = useState<'all' | Payer>('all')
  const [searchCredit, setSearchCredit] = useState<'all' | 'yes' | 'no'>('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [minAmount, setMinAmount] = useState('')
  const [maxAmount, setMaxAmount] = useState('')
  const [searchCategory, setSearchCategory] = useState('all')
  const [creditActual, setCreditActual] = useState('')
  const [creditMonth, setCreditMonth] = useState(initialMonth)
  const [budgetRows, setBudgetRows] = useState<any[]>([])
  const [creditTotals, setCreditTotals] = useState<any[]>([])
  const [budgetMonth, setBudgetMonth] = useState(initialMonth)
  const [budgetTotal, setBudgetTotal] = useState('')
  const [budgetCategory, setBudgetCategory] = useState('')
  const [budgetAmount, setBudgetAmount] = useState('')
  const [form, setForm] = useState({
    entry_date: localDate(today), kind: 'expense' as EntryKind, category_id: '',
    amount_yen: '', payer: 'you' as Payer, is_credit: false, memo: '',
  })

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => listener.subscription.unsubscribe()
  }, [])

  const loadAll = useCallback(async () => {
    if (!supabase || !session?.user) return
    setBusy(true); setMessage('')
    try {
      const { data: membership, error: memberError } = await supabase
        .from('household_members').select('household_id').eq('user_id', session.user.id).maybeSingle()
      if (memberError) throw memberError
      if (!membership) { setHouseholdId(''); setMessage('このアカウントは家計簿に登録されていません。管理者にメンバー登録を依頼してください。'); return }
      setHouseholdId(membership.household_id)
      const [txRes, catRes, budgetRes, creditRes] = await Promise.all([
        supabase.from('transactions').select('*, categories(name, kind)').eq('household_id', membership.household_id).order('entry_date', { ascending: false }).limit(5000),
        supabase.from('categories').select('*').eq('household_id', membership.household_id).eq('active', true).order('name'),
        supabase.from('budgets').select('*, categories(name)').eq('household_id', membership.household_id).eq('budget_month', `${budgetMonth}-01`),
        supabase.from('credit_monthly_totals').select('*').eq('household_id', membership.household_id),
      ])
      if (txRes.error) throw txRes.error
      if (catRes.error) throw catRes.error
      if (budgetRes.error) throw budgetRes.error
      if (creditRes.error) throw creditRes.error
      setCreditTotals(creditRes.data ?? [])
      setTransactions((txRes.data ?? []) as Transaction[])
      setCategories((catRes.data ?? []) as Category[])
      setBudgetRows(budgetRes.data ?? [])
    } catch (e: any) { setMessage(e.message ?? 'データの読み込みに失敗しました。') }
    finally { setBusy(false) }
  }, [session, budgetMonth])

  useEffect(() => { void loadAll() }, [loadAll])

  useEffect(() => {
    if (!form.category_id && categories.some(c => c.kind === form.kind)) {
      const cat = categories.find(c => c.kind === form.kind)
      if (cat) setForm(f => ({ ...f, category_id: cat.id }))
    }
  }, [categories, form.kind, form.category_id])

  const monthTx = useMemo(() => transactions.filter(t => t.entry_date.startsWith(month)), [transactions, month])
  const income = monthTx.filter(t => t.kind === 'income').reduce((s,t) => s+t.amount_yen,0)
  const expense = monthTx.filter(t => t.kind === 'expense').reduce((s,t) => s+t.amount_yen,0)
  const creditSum = monthTx.filter(t => t.kind === 'expense' && t.is_credit).reduce((s,t) => s+t.amount_yen,0)
  const moveMonth = (delta: number) => {
    const d = new Date(Number(month.slice(0,4)), Number(month.slice(5,7))-1+delta, 1)
    setMonth(monthString(d))
  }

  async function signIn(e: FormEvent) {
    e.preventDefault(); if (!supabase) return
    setAuthError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setAuthError('ログインできませんでした。メールアドレスとパスワードを確認してください。')
  }

  async function saveTransaction(e: FormEvent) {
    e.preventDefault()
    if (!supabase || !householdId) return
    const amount = Number(form.amount_yen)
    if (!Number.isSafeInteger(amount) || amount <= 0) { setMessage('金額は1円以上の整数で入力してください。'); return }
    if (!form.category_id) { setMessage('カテゴリを選択してください。'); return }
    setBusy(true); setMessage('')
    const payload = {
      household_id: householdId, entry_date: form.entry_date, kind: form.kind,
      category_id: form.category_id, amount_yen: amount, payer: form.payer,
      is_credit: form.kind === 'expense' && form.is_credit, memo: form.memo.trim(),
      updated_at: new Date().toISOString(),
    }
    const result = editingId
      ? await supabase.from('transactions').update(payload).eq('id', editingId).eq('household_id', householdId)
      : await supabase.from('transactions').insert(payload)
    if (result.error) setMessage(result.error.message)
    else {
      setMessage(editingId ? '取引を更新しました。' : '取引を登録しました。')
      setEditingId(null); setForm(f => ({ ...f, amount_yen: '', memo: '', is_credit: false }))
      await loadAll()
      setTab('calendar')
    }
    setBusy(false)
  }

  function editTransaction(t: Transaction) {
    setEditingId(t.id)
    setForm({ entry_date:t.entry_date, kind:t.kind, category_id:t.category_id, amount_yen:String(t.amount_yen), payer:t.payer, is_credit:t.is_credit, memo:t.memo ?? '' })
    setTab('entry')
  }

  async function deleteTransaction(t: Transaction) {
    if (!supabase || !confirm(`${t.entry_date} ${t.categories?.name ?? ''} ${yen(t.amount_yen)}を削除しますか？この操作は取り消せません。`)) return
    const { error } = await supabase.from('transactions').delete().eq('id', t.id).eq('household_id', householdId)
    if (error) setMessage(error.message); else { setMessage('取引を削除しました。'); await loadAll() }
  }

  const searchResults = transactions.filter(t =>
    (!fromDate || t.entry_date >= fromDate) && (!toDate || t.entry_date <= toDate) &&
    (searchKind === 'all' || t.kind === searchKind) && (searchPayer === 'all' || t.payer === searchPayer) &&
    (searchCredit === 'all' || (searchCredit === 'yes' ? t.is_credit : !t.is_credit)) &&
    (searchCategory === 'all' || t.category_id === searchCategory) &&
    (minAmount === '' || t.amount_yen >= Number(minAmount)) && (maxAmount === '' || t.amount_yen <= Number(maxAmount)) &&
    (!searchText || (t.memo ?? '').toLocaleLowerCase().includes(searchText.toLocaleLowerCase()))
  )

  async function saveBudget(e: FormEvent) {
    e.preventDefault(); if (!supabase || !householdId) return
    const amount = Number(budgetAmount)
    if (!Number.isSafeInteger(amount) || amount < 0) { setMessage('予算は0円以上の整数で入力してください。'); return }
    const payload = { household_id:householdId, budget_month:budgetMonth, category_id:budgetCategory || null, amount_yen:amount, updated_at:new Date().toISOString() }
    const result = await supabase.from('budgets').upsert(payload, { onConflict:'household_id,budget_month,category_id' })
    if (result.error) setMessage(result.error.message)
    else { setMessage('予算を保存しました。'); setBudgetAmount(''); await loadAll() }
  }

  async function saveCreditTotal(e: FormEvent) {
    e.preventDefault(); if (!supabase || !householdId) return
    const amount = Number(creditActual)
    if (!Number.isSafeInteger(amount) || amount < 0) { setMessage('カード明細の金額は0円以上の整数で入力してください。'); return }
    const { error } = await supabase.from('credit_monthly_totals').upsert(
      { household_id:householdId, target_month:creditMonth, actual_amount_yen:amount, updated_at:new Date().toISOString() },
      { onConflict:'household_id,target_month' },
    )
    if (error) setMessage(error.message); else { setMessage('カード明細総額を保存しました。'); setCreditActual(''); await loadAll() }
  }

  if (!supabaseConfigured) return <main className="center"><section className="panel setup"><Wallet size={34}/><h1>ふたりの家計簿</h1><p>Supabaseの接続設定がまだありません。</p><ol><li><code>.env.example</code>を複製して<code>.env.local</code>を作成</li><li>SupabaseのProject URLと公開用キーを入力</li><li><code>npm run dev</code>で再起動</li></ol><p className="muted">秘密のservice_roleキーは絶対に設定しないでください。</p></section></main>

  if (!session) return <main className="center"><form className="panel login" onSubmit={signIn}><div className="brand"><Wallet/><span>ふたりの家計簿</span></div><p className="muted">夫婦で共有する、シンプルな家計簿。</p><label>メールアドレス<input type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)}/></label><label>パスワード<input type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/></label>{authError && <p className="error">{authError}</p>}<button className="primary" type="submit">ログイン</button><p className="muted small">アカウントは管理者から招待された方のみ利用できます。</p></form></main>

  const visibleCategories = categories.filter(c => c.kind === form.kind)
  const daily = new Map<string,{income:number;expense:number}>()
  monthTx.forEach(t => { const d=daily.get(t.entry_date) ?? {income:0,expense:0}; d[t.kind]+=t.amount_yen; daily.set(t.entry_date,d) })
  const start = new Date(Number(month.slice(0,4)),Number(month.slice(5,7))-1,1)
  const days = new Date(start.getFullYear(),start.getMonth()+1,0).getDate()
  const offset = start.getDay()
  const selectedCreditRow = creditTotals.find(t => t.target_month === `${creditMonth}-01`)
  const actualCredit = selectedCreditRow?.actual_amount_yen as number | undefined
  const creditForMonth = transactions.filter(t=>t.entry_date.startsWith(creditMonth)&&t.kind==='expense'&&t.is_credit).reduce((s,t)=>s+t.amount_yen,0)

  return <div className="app-shell">
    <aside className="sidebar"><div className="brand"><Wallet/><span>ふたりの家計簿</span></div><div className="nav-label">家計簿</div>
      <NavButton active={tab==='calendar'} icon={<CalendarDays/>} onClick={()=>setTab('calendar')}>家計簿を見る</NavButton>
      <NavButton active={tab==='entry'} icon={<Plus/>} onClick={()=>{setEditingId(null);setForm(f=>({...f,entry_date:localDate(today),amount_yen:'',memo:''}));setTab('entry')}}>新しい取引</NavButton>
      <NavButton active={tab==='search'} icon={<Search/>} onClick={()=>setTab('search')}>過去の取引を検索</NavButton>
      <NavButton active={tab==='summary'} icon={<LayoutDashboard/>} onClick={()=>setTab('summary')}>月ごとの収支</NavButton>
      <NavButton active={tab==='budget'} icon={<Wallet/>} onClick={()=>setTab('budget')}>予算との差</NavButton>
      <NavButton active={tab==='credit'} icon={<CreditCard/>} onClick={()=>setTab('credit')}>クレジット差額</NavButton>
      <div className="sidebar-bottom"><span className="muted small">{session.user.email}</span><button className="ghost" onClick={()=>supabase?.auth.signOut()}><LogOut size={16}/> ログアウト</button></div>
    </aside>
    <main className="main">
      <header className="topbar"><div><div className="eyebrow">HOUSEHOLD FINANCE</div><h1>{({calendar:'家計簿を見る',entry:editingId?'取引を修正':'新しい取引',search:'過去の取引を検索',summary:'月ごとの収支',budget:'予算との差',credit:'クレジット差額'} as Record<Tab,string>)[tab]}</h1></div><div className="month-switch"><button className="icon-button" aria-label="前月" onClick={()=>moveMonth(-1)}><ChevronLeft/></button><strong>{month.slice(0,4)}年{Number(month.slice(5,7))}月</strong><button className="icon-button" aria-label="翌月" onClick={()=>moveMonth(1)}><ChevronRight/></button></div></header>
      {message && <div className="notice" role="status">{message}<button onClick={()=>setMessage('')}>閉じる</button></div>}
      {busy && <p className="muted">読み込み中…</p>}
      {!householdId && !busy && <section className="panel"><h2>家計簿へのアクセス設定が必要です</h2><p>{message || 'Supabaseで家計簿メンバー登録を確認してください。'}</p></section>}
      {householdId && tab==='calendar' && <>
        <section className="stats"><Stat label="収入" value={yen(income)} tone="green"/><Stat label="支出" value={yen(expense)} tone="orange"/><Stat label="収支差額" value={yen(income-expense)} tone={income-expense>=0?'green':'orange'}/></section>
        <section className="panel calendar-panel"><div className="section-head"><div><h2>{month.slice(0,4)}年{Number(month.slice(5,7))}月</h2><p className="muted">日付ごとの収入・支出合計</p></div><button className="secondary" onClick={()=>setTab('entry')}><Plus size={16}/> 取引を追加</button></div>
          <div className="calendar-grid">{['日','月','火','水','木','金','土'].map(w=><div className="weekday" key={w}>{w}</div>)}{Array.from({length:offset},(_,i)=><div className="day empty" key={`e${i}`}/>)}{Array.from({length:days},(_,i)=>i+1).map(d=>{const key=`${month}-${String(d).padStart(2,'0')}`;const sums=daily.get(key);return <button className="day" key={key} onClick={()=>{setFromDate(key);setToDate(key);setTab('search')}}><span className="day-number">{d}</span>{sums?.expense ? <span className="expense">{yen(sums.expense)}</span>:null}{sums?.income ? <span className="income">{yen(sums.income)}</span>:null}</button>})}</div>
        </section>
        <section className="panel"><div className="section-head"><h2>この月の取引</h2><button className="text-button" onClick={()=>setTab('search')}>すべて見る →</button></div><TransactionTable items={monthTx.slice(0,12)} onEdit={editTransaction} onDelete={deleteTransaction}/></section>
      </>}
      {householdId && tab==='entry' && <section className="panel form-panel"><h2>{editingId?'取引を修正':'取引を登録'}</h2><form className="entry-form" onSubmit={saveTransaction}>
        <div className="field"><label>収支区分</label><div className="segmented"><button type="button" className={form.kind==='expense'?'selected':''} onClick={()=>setForm(f=>({...f,kind:'expense',category_id:categories.find(c=>c.kind==='expense')?.id??''}))}>支出</button><button type="button" className={form.kind==='income'?'selected':''} onClick={()=>setForm(f=>({...f,kind:'income',category_id:categories.find(c=>c.kind==='income')?.id??''}))}>収入</button></div></div>
        <div className="field"><label>日付</label><input type="date" required value={form.entry_date} onChange={e=>setForm(f=>({...f,entry_date:e.target.value}))}/></div>
        <div className="field"><label>カテゴリ</label><select required value={form.category_id} onChange={e=>setForm(f=>({...f,category_id:e.target.value}))}><option value="">選択してください</option>{visibleCategories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        <div className="field"><label>金額（円・整数）</label><input type="number" min="1" step="1" required inputMode="numeric" placeholder="例：5000" value={form.amount_yen} onChange={e=>setForm(f=>({...f,amount_yen:e.target.value}))}/></div>
        <div className="field"><label>誰の支払いか</label><div className="segmented"><button type="button" className={form.payer==='you'?'selected':''} onClick={()=>setForm(f=>({...f,payer:'you'}))}>あなた</button><button type="button" className={form.payer==='wife'?'selected':''} onClick={()=>setForm(f=>({...f,payer:'wife'}))}>奥様</button></div></div>
        {form.kind==='expense' && <label className="check-field"><input type="checkbox" checked={form.is_credit} onChange={e=>setForm(f=>({...f,is_credit:e.target.checked}))}/> クレジットカードを利用した</label>}
        <div className="field full"><label>メモ（任意）</label><textarea rows={3} placeholder="買ったもの、用途など" value={form.memo} onChange={e=>setForm(f=>({...f,memo:e.target.value}))}/></div>
        <div className="form-actions"><button type="button" className="secondary" onClick={()=>{setEditingId(null);setTab('calendar')}}>キャンセル</button><button className="primary" disabled={busy}>{editingId?'変更を保存':'取引を登録'}</button></div>
      </form></section>}
      {householdId && tab==='search' && <section className="panel"><h2>検索条件</h2><div className="search-grid">
        <div className="field"><label>開始日</label><input type="date" value={fromDate} onChange={e=>setFromDate(e.target.value)}/></div><div className="field"><label>終了日</label><input type="date" value={toDate} onChange={e=>setToDate(e.target.value)}/></div>
        <div className="field"><label>カテゴリ</label><select value={searchCategory} onChange={e=>setSearchCategory(e.target.value)}><option value="all">すべて</option>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        <div className="field"><label>収支区分</label><select value={searchKind} onChange={e=>setSearchKind(e.target.value as any)}><option value="all">すべて</option><option value="expense">支出</option><option value="income">収入</option></select></div>
        <div className="field"><label>支払者</label><select value={searchPayer} onChange={e=>setSearchPayer(e.target.value as any)}><option value="all">すべて</option><option value="you">あなた</option><option value="wife">奥様</option></select></div>
        <div className="field"><label>クレジット利用</label><select value={searchCredit} onChange={e=>setSearchCredit(e.target.value as any)}><option value="all">すべて</option><option value="yes">利用あり</option><option value="no">利用なし</option></select></div>
        <div className="field"><label>金額（下限）</label><input type="number" min="0" step="1" value={minAmount} onChange={e=>setMinAmount(e.target.value)}/></div><div className="field"><label>金額（上限）</label><input type="number" min="0" step="1" value={maxAmount} onChange={e=>setMaxAmount(e.target.value)}/></div>
        <div className="field full"><label>メモに含まれる文字列</label><input value={searchText} onChange={e=>setSearchText(e.target.value)} placeholder="キーワード"/></div>
      </div><div className="section-head results-head"><h2>検索結果（{searchResults.length}件）</h2><button className="secondary" onClick={()=>{setFromDate('');setToDate('');setSearchText('');setSearchKind('all');setSearchPayer('all');setSearchCredit('all');setSearchCategory('all');setMinAmount('');setMaxAmount('')}}>条件をクリア</button></div><TransactionTable items={searchResults} onEdit={editTransaction} onDelete={deleteTransaction}/></section>}
      {householdId && tab==='summary' && <><section className="stats"><Stat label="収入" value={yen(income)} tone="green"/><Stat label="支出" value={yen(expense)} tone="orange"/><Stat label="収支差額" value={yen(income-expense)} tone={income-expense>=0?'green':'orange'}/></section><section className="panel"><h2>カテゴリ別支出</h2>{categories.filter(c=>c.kind==='expense').map(c=>{const amount=monthTx.filter(t=>t.kind==='expense'&&t.category_id===c.id).reduce((s,t)=>s+t.amount_yen,0);if(!amount)return null;return <div className="category-row" key={c.id}><span>{c.name}</span><div className="bar-track"><div className="bar-fill" style={{width:`${expense?Math.min(100,amount/expense*100):0}%`}}/></div><strong>{yen(amount)}</strong><span className="muted small">{expense?Math.round(amount/expense*100):0}%</span></div>})}</section></>}
      {householdId && tab==='budget' && <section className="panel"><div className="section-head"><div><h2>予算設定・実績</h2><p className="muted">予算は月ごとに設定します。</p></div><input aria-label="予算対象月" className="month-input" type="month" value={budgetMonth} onChange={e=>setBudgetMonth(e.target.value)}/></div><form className="search-grid budget-form" onSubmit={saveBudget}><div className="field"><label>対象</label><select value={budgetCategory} onChange={e=>setBudgetCategory(e.target.value)}><option value="">全体予算</option>{categories.filter(c=>c.kind==='expense').map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div><div className="field"><label>予算額（円）</label><input type="number" min="0" step="1" required value={budgetAmount} onChange={e=>setBudgetAmount(e.target.value)}/></div><div className="field"><label>&nbsp;</label><button className="primary">予算を保存</button></div></form>{budgetRows.map((b:any)=>{const actual=transactions.filter(t=>t.entry_date.startsWith(b.budget_month)&&t.kind==='expense'&&(!b.category_id||t.category_id===b.category_id)).reduce((s,t)=>s+t.amount_yen,0);return <div className="budget-row" key={b.id}><div><strong>{b.category_id?b.categories?.name:'全体予算'}</strong><p className="muted small">予算 {yen(b.amount_yen)} / 実績 {yen(actual)}</p></div><strong className={actual>b.amount_yen?'expense':'income'}>{actual>b.amount_yen?`超過 ${yen(actual-b.amount_yen)}`:`残り ${yen(b.amount_yen-actual)}`}</strong></div>})}</section>}
      {householdId && tab==='credit' && <section className="panel"><h2>クレジット利用額の照合</h2><p className="muted">家計簿の利用日ベースの合計と、カード明細の同じ利用期間の合計を比較してください。</p><form className="credit-form" onSubmit={saveCreditTotal}><div className="field"><label>対象月</label><input type="month" required value={creditMonth} onChange={e=>setCreditMonth(e.target.value)}/></div><div className="field"><label>カード明細の利用総額（円）</label><input type="number" min="0" step="1" required value={creditActual} onChange={e=>setCreditActual(e.target.value)}/></div><button className="primary">総額を保存</button></form><div className="credit-cards"><Stat label="家計簿上のクレジット利用額" value={yen(creditForMonth)} tone="orange"/><Stat label="カード明細の総額" value={actualCredit===undefined?'未入力':yen(actualCredit)} tone="neutral"/><Stat label="差額（明細 − 家計簿）" value={actualCredit===undefined?'—':yen(actualCredit-creditForMonth)} tone={actualCredit===creditForMonth?'green':'orange'}/></div><p className="muted small">※ 対象月が同じ利用期間であることを確認してください。引き落とし月の請求額と利用日ベースの合計は、そのまま比較できない場合があります。</p></section>}
      <footer>ふたりの家計簿 · <button className="text-button" onClick={()=>void loadAll()}>データを再読み込み</button></footer>
    </main>
  </div>
}

function NavButton({active,icon,children,onClick}:{active:boolean;icon:React.ReactNode;children:React.ReactNode;onClick:()=>void}) {
  return <button className={`nav-button ${active?'active':''}`} onClick={onClick}>{icon}<span>{children}</span></button>
}
function Stat({label,value,tone}:{label:string;value:string;tone:string}) {
  return <div className="stat-card"><span className="muted">{label}</span><strong className={tone==='green'?'income':tone==='orange'?'expense':''}>{value}</strong></div>
}
function TransactionTable({items,onEdit,onDelete}:{items:Transaction[];onEdit:(t:Transaction)=>void;onDelete:(t:Transaction)=>void}) {
  if (!items.length) return <div className="empty-state">取引がありません。</div>
  return <div className="table-wrap"><table><thead><tr><th>日付</th><th>カテゴリ・メモ</th><th>区分</th><th>支払者</th><th>金額</th><th>カード</th><th>操作</th></tr></thead><tbody>{items.map(t=><tr key={t.id}><td>{t.entry_date}</td><td><strong>{t.categories?.name ?? 'カテゴリ'}</strong>{t.memo&&<div className="muted small memo">{t.memo}</div>}</td><td><span className={t.kind==='expense'?'expense':'income'}>{t.kind==='expense'?'支出':'収入'}</span></td><td>{t.payer==='you'?'あなた':'奥様'}</td><td className="amount">{yen(t.amount_yen)}</td><td>{t.kind==='expense'&&t.is_credit?'利用':'—'}</td><td><div className="actions"><button className="text-button" onClick={()=>onEdit(t)}>修正</button><button className="text-button danger" onClick={()=>onDelete(t)}>削除</button></div></td></tr>)}</tbody></table></div>
}
