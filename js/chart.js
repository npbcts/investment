// ============================================================
// chart.js — 公共图表渲染逻辑（核电 / 装机容量 / 纯财务 三种模式）
// 由各公司页面壳 fetch 对应 data/<code>.json 后调用 loadChart()
// ============================================================
const COLORS = ["#e74c3c", "#2f80ed", "#9b59b6", "#27ae60", "#e67e22", "#f39c12", "#e84393", "#1a5276", "#00acc1", "#c0392b", "#6c3483", "#0e6655", "#b7950b", "#5d6d7e", "#d35400"];

function ffillAt(date, arr) {
  let last = null;
  for (const [d, v] of arr) { if (d <= date) last = v; else break; }
  return last;
}

function computeMcRestored(marketCap, dividendPerShare, totalShares) {
  const events = dividendPerShare
    .map(p => ({ date: (Number(p[0].slice(0, 4)) + 1) + '-06-30', total: p[1] * totalShares / 1e8 }))
    .sort((a, b) => a.date.localeCompare(b.date));
  let cum = 0, idx = 0;
  return marketCap.map(([date, mc]) => {
    while (idx < events.length && events[idx].date <= date) { cum += events[idx].total; idx++; }
    return [date, +(mc + cum).toFixed(2)];
  });
}

function rollAvg(arr) {
  return arr.map(([d, mc], i) => {
    const w = arr.slice(Math.max(0, i - 3), i + 1);
    return [d, +(w.reduce((s, p) => s + p[1], 0) / w.length).toFixed(2)];
  });
}

function baseValue(data, baseDate) {
  let last = null;
  for (const d of data) { if (d[0] <= baseDate) last = d[1]; else break; }
  return last !== null ? last : data[0][1];
}

function fmt(v) {
  return Number.isFinite(v) ? v.toLocaleString('zh-CN', { maximumFractionDigits: 2 }) : String(v);
}

function normLine(extra) {
  return Object.assign({ type: 'line', smooth: true, showSymbol: true, symbolSize: 6, lineStyle: { width: 2.2 }, emphasis: { focus: 'series' } }, extra || {});
}

// ============ 主入口 ============
function loadChart(dataUrl) {
  fetch(dataUrl)
    .then(r => { if (!r.ok) throw new Error('数据加载失败: ' + r.status); return r.json(); })
    .then(data => renderChart(data))
    .catch(e => {
      document.getElementById('chartTitle').textContent = '加载失败';
      document.getElementById('chartNote').textContent = e.message;
    });
}

function renderChart(data) {
  const { code, name, type, baseDate, totalShares, marketCap, pe, pb, dividendPerShare, capacity, reactor, underConstruction, gwPerOp, gwPerUc } = data;

  const isNuclear = !!reactor && !!underConstruction;
  const isCapacity = !!capacity && !isNuclear;

  // ===== 派生：还原分红市值 =====
  const mcRestored = computeMcRestored(marketCap, dividendPerShare, totalShares);

  // ===== 经营规模派生 =====
  let totalUnits = null, reactorGW = null, underConstructionGW = null, totalGW = null;
  if (isNuclear) {
    const am = new Map(reactor), bm = new Map(underConstruction);
    const dates = [...new Set([...am.keys(), ...bm.keys()])].sort();
    totalUnits = [];
    let la = null, lb = null;
    for (const d of dates) {
      if (am.has(d)) la = am.get(d);
      if (bm.has(d)) lb = bm.get(d);
      if (la !== null && lb !== null) totalUnits.push([d, la + lb]);
    }
    if (gwPerOp && gwPerUc) {
      reactorGW = reactor.map(([d, n]) => [d, +(n * gwPerOp).toFixed(1)]);
      underConstructionGW = underConstruction.map(([d, n]) => [d, +(n * gwPerUc).toFixed(1)]);
      const am2 = new Map(reactorGW), bm2 = new Map(underConstructionGW);
      const dates2 = [...new Set([...am2.keys(), ...bm2.keys()])].sort();
      totalGW = [];
      let la2 = null, lb2 = null;
      for (const d of dates2) {
        if (am2.has(d)) la2 = am2.get(d);
        if (bm2.has(d)) lb2 = bm2.get(d);
        if (la2 !== null && lb2 !== null) totalGW.push([d, +(la2 + lb2).toFixed(1)]);
      }
    }
  }

  // ===== 派生：估值密度指标 =====
  const rollMc = rollAvg(mcRestored);
  let mcPerOpGW = null, mcPerTotalGW = null, mcPerCapGW = null, avgPerCapGW = null,
      floorValuation = null, ceilingValuation = null;

  if (isNuclear && gwPerOp && gwPerUc) {
    mcPerOpGW = mcRestored.map(([d, mc]) => { const g = ffillAt(d, reactorGW); return g ? [d, +(mc / g).toFixed(3)] : null; }).filter(Boolean);
    mcPerTotalGW = rollMc.map(([d, mc]) => { const g = ffillAt(d, totalGW); return g ? [d, +(mc / g).toFixed(3)] : null; }).filter(Boolean);
    const minR = Math.min(...mcPerTotalGW.map(p => p[1]));
    const maxR = Math.max(...mcPerTotalGW.map(p => p[1]));
    floorValuation = mcRestored.map(([d]) => { const g = ffillAt(d, totalGW); return g ? [d, +(minR * g).toFixed(2)] : null; }).filter(Boolean);
    ceilingValuation = mcRestored.map(([d]) => { const g = ffillAt(d, totalGW); return g ? [d, +(maxR * g).toFixed(2)] : null; }).filter(Boolean);
  } else if (isCapacity) {
    mcPerCapGW = mcRestored.map(([d, mc]) => { const g = ffillAt(d, capacity); return g ? [d, +(mc / g).toFixed(3)] : null; }).filter(Boolean);
    avgPerCapGW = rollMc.map(([d, mc]) => { const g = ffillAt(d, capacity); return g ? [d, +(mc / g).toFixed(3)] : null; }).filter(Boolean);
    const minR = Math.min(...avgPerCapGW.map(p => p[1]));
    const maxR = Math.max(...avgPerCapGW.map(p => p[1]));
    floorValuation = mcRestored.map(([d]) => { const g = ffillAt(d, capacity); return g ? [d, +(minR * g).toFixed(2)] : null; }).filter(Boolean);
    ceilingValuation = mcRestored.map(([d]) => { const g = ffillAt(d, capacity); return g ? [d, +(maxR * g).toFixed(2)] : null; }).filter(Boolean);
  }

  // ===== normDefs =====
  const normDefs = [];
  if (isNuclear) {
    normDefs.push({ name: '在运机组(台)', data: reactor, color: COLORS[0] });
    if (gwPerOp && gwPerUc) normDefs.push({ name: '在运装机(万千瓦)', data: reactorGW, color: COLORS[9], dashed: true });
    normDefs.push({ name: '在运+在建(台)', data: totalUnits, color: COLORS[6] });
    if (gwPerOp && gwPerUc) normDefs.push({ name: '在运+在建装机(万千瓦)', data: totalGW, color: COLORS[10], dashed: true });
  } else if (isCapacity) {
    normDefs.push({ name: '装机容量(万千瓦)', data: capacity, color: COLORS[0] });
  }
  normDefs.push({ name: '总市值', data: marketCap, color: COLORS[1], baseRef: marketCap });
  normDefs.push({ name: '还原分红市值', data: mcRestored, color: COLORS[7], dashed: true, baseRef: marketCap });
  if (isNuclear && gwPerOp && gwPerUc) {
    normDefs.push({ name: '市值/在运万千瓦', data: mcPerOpGW, color: COLORS[11] });
    normDefs.push({ name: '地板估值(最低均单千瓦×总规模)', data: floorValuation, color: COLORS[12], dashed: true, baseRef: marketCap });
    normDefs.push({ name: '天花板估值(最高均单千瓦×总规模)', data: ceilingValuation, color: COLORS[14], dashed: true, baseRef: marketCap });
    normDefs.push({ name: '平均市值/总规模万千瓦', data: mcPerTotalGW, color: COLORS[13], dashed: true });
  } else if (isCapacity) {
    normDefs.push({ name: '市值/装机万千瓦', data: mcPerCapGW, color: COLORS[11] });
    normDefs.push({ name: '地板估值(最低单千瓦×装机)', data: floorValuation, color: COLORS[12], dashed: true, baseRef: marketCap });
    normDefs.push({ name: '天花板估值(最高单千瓦×装机)', data: ceilingValuation, color: COLORS[14], dashed: true, baseRef: marketCap });
    normDefs.push({ name: '平均市值/装机万千瓦', data: avgPerCapGW, color: COLORS[13], dashed: true });
  }
  normDefs.push({ name: '市盈率PE', data: pe, color: COLORS[2] });
  normDefs.push({ name: '市净率PB', data: pb, color: COLORS[3] });
  normDefs.push({ name: '每股股利', data: dividendPerShare, color: COLORS[4] });

  // ===== 默认勾选（对齐核电） =====
  let DEFAULT_ON;
  if (isNuclear) {
    DEFAULT_ON = new Set(['在运装机(万千瓦)', '在运+在建装机(万千瓦)', '总市值', '还原分红市值']);
  } else if (isCapacity) {
    DEFAULT_ON = new Set(['装机容量(万千瓦)', '总市值', '还原分红市值']);
  } else {
    DEFAULT_ON = new Set(['总市值', '还原分红市值']);
  }

  // ===== 填充标题/副标题/说明 =====
  const yearRange = (baseDate || '').slice(0, 4) + '—' + (marketCap.length ? marketCap[marketCap.length - 1][0].slice(0, 4) : '');
  document.getElementById('chartTitle').textContent = `${name}（${code}）核心指标走势（${yearRange}）`;
  const scaleDesc = isNuclear ? '反应堆规模' : (isCapacity ? '装机容量' : '');
  document.getElementById('chartSub').textContent = `总市值 · 市盈率 · 市净率 · 分红${scaleDesc ? ' · ' + scaleDesc : ''} —— 鼠标悬停查看数值，底部滑块缩放时间轴`;
  document.getElementById('chartNote').innerHTML = buildNote(baseDate, isNuclear, isCapacity, totalShares);

  // ===== 渲染 =====
  const chart = echarts.init(document.getElementById('chart'));
  const selectedState = {};
  normDefs.forEach(d => { selectedState[d.name] = DEFAULT_ON.has(d.name); });

  const masterDates = [...new Set(normDefs.flatMap(d => d.data.map(p => p[0])))].sort();
  const timeMin = masterDates[0], timeMax = masterDates[masterDates.length - 1];

  function buildNormOption() {
    const series = normDefs.map(d => {
      const base = baseValue(d.baseRef || d.data, baseDate);
      const data = d.data.map(p => ({ value: [p[0], +(p[1] / base * 100).toFixed(2)], raw: p[1], base }));
      return normLine({ name: d.name, data, lineStyle: { width: 2.2, color: d.color, type: d.dashed ? 'dashed' : 'solid' }, itemStyle: { color: d.color } });
    });
    return {
      color: COLORS,
      legend: { show: false, selected: selectedState },
      tooltip: {
        trigger: 'axis', axisPointer: { type: 'line' },
        backgroundColor: 'rgba(30,40,55,.92)', borderWidth: 0, textStyle: { color: '#fff', fontSize: 12 },
        formatter: function (params) {
          let s = '<b>' + params[0].axisValueLabel + '</b>';
          params.forEach(it => { s += '<br/>' + it.marker + it.seriesName + '：' + fmt(it.data.raw) + '　<span style="opacity:.65">(指数 ' + it.value[1] + ')</span>'; });
          return s;
        }
      },
      grid: { left: 60, right: 40, top: 44, bottom: 70 },
      xAxis: { type: 'time', min: timeMin, max: timeMax, axisLine: { lineStyle: { color: '#c8ced8' } }, axisLabel: { color: '#6b7a8d', fontSize: 11 }, axisTick: { show: false }, splitLine: { show: false } },
      yAxis: { type: 'value', name: '指数\n(基期=100)', nameTextStyle: { color: '#6b7a8d', fontSize: 11, align: 'left' }, axisLabel: { color: '#6b7a8d', fontSize: 11 }, axisLine: { show: false }, axisTick: { show: false }, splitLine: { lineStyle: { color: '#eef0f5' } } },
      dataZoom: [{ type: 'inside', start: 0, end: 100 }, { type: 'slider', bottom: 8, height: 22, borderColor: '#d5dbe5', backgroundColor: '#eef0f5', fillerColor: 'rgba(47,128,237,.15)', handleStyle: { color: '#2f80ed' } }],
      series
    };
  }

  chart.setOption(buildNormOption());
  window.addEventListener('resize', () => chart.resize());

  // ===== 勾选框 =====
  const legendBox = document.getElementById('legendBox');
  legendBox.innerHTML = '';
  normDefs.forEach(d => {
    const label = document.createElement('label');
    label.style.cssText = 'display:inline-flex;align-items:center;font-size:13px;color:#4a5568;cursor:pointer;';
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = selectedState[d.name]; cb.style.cssText = 'margin-right:4px;cursor:pointer;';
    const mk = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    mk.setAttribute('width', '22'); mk.setAttribute('height', '12');
    mk.style.cssText = 'margin-right:5px;vertical-align:middle;flex:none;';
    const ln = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    ln.setAttribute('x1', '1'); ln.setAttribute('y1', '6'); ln.setAttribute('x2', '21'); ln.setAttribute('y2', '6');
    ln.setAttribute('stroke', d.color); ln.setAttribute('stroke-width', '2');
    if (d.dashed) ln.setAttribute('stroke-dasharray', '4 3');
    const pt = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    pt.setAttribute('cx', '11'); pt.setAttribute('cy', '6'); pt.setAttribute('r', '3'); pt.setAttribute('fill', d.color);
    mk.appendChild(ln); mk.appendChild(pt);
    label.appendChild(cb); label.appendChild(mk); label.appendChild(document.createTextNode(d.name));
    legendBox.appendChild(label);
    cb.onchange = () => { selectedState[d.name] = cb.checked; chart.setOption({ legend: { selected: selectedState } }); };
  });

  // ===== 动态演示 =====
  let playTimer = null, frame = 0;
  function seriesAtDate(limitDate) {
    return normDefs.map(d => {
      const base = baseValue(d.baseRef || d.data, baseDate);
      const sliced = d.data.filter(p => p[0] <= limitDate);
      const data = sliced.map(p => ({ value: [p[0], +(p[1] / base * 100).toFixed(2)], raw: p[1], base }));
      return normLine({ name: d.name, data, lineStyle: { width: 2.2, color: d.color, type: d.dashed ? 'dashed' : 'solid' }, itemStyle: { color: d.color } });
    });
  }
  const btnPlay = document.getElementById('btnPlay');
  btnPlay.onclick = function () {
    if (playTimer) { clearInterval(playTimer); playTimer = null; this.textContent = '▶ 动态演示'; chart.setOption(buildNormOption(), true); return; }
    frame = 0; this.textContent = '⏸ 停止';
    chart.setOption({ series: seriesAtDate(masterDates[0]) });
    playTimer = setInterval(() => {
      frame++;
      if (frame >= masterDates.length) { clearInterval(playTimer); playTimer = null; btnPlay.textContent = '▶ 动态演示'; chart.setOption(buildNormOption(), true); return; }
      chart.setOption({ series: seriesAtDate(masterDates[frame]) });
    }, 120);
  };
}

function buildNote(baseDate, isNuclear, isCapacity, totalShares) {
  const parts = [
    `① 归一化指数视图以 <b>${baseDate}</b> 为统一基期（=100），各指标同轴对比，上方勾选框可控制显隐；`,
    '② 财务交易指标（总市值、市盈率、市净率）为季度频率，数据来自腾讯行情/东方财富：总市值=季度末收盘价×总股本，市净率=收盘价÷每股净资产，市盈率=收盘价÷滚动12个月EPS(TTM)；',
    '③ 「还原分红市值」（深蓝虚线）= 总市值 + 截至当日累计已派发现金分红（末期按次年6月派发估算），反映若不除息的股东总回报；',
  ];
  if (isCapacity) {
    parts.push('④ 装机容量（万千瓦）为<b>基于公开披露信息的整理/估算值</b>（年末口径），逐年精确值需核实；');
    parts.push('⑤ 估值密度指标（基于分红前估值，平均=近4季滚动平均）：「市值/装机万千瓦」=单千瓦装机对应估值；「地板估值」=历史最低「平均市值/装机」×装机容量，得保守下沿；「天花板估值」=历史最高该估值×装机容量，得乐观上沿（含 IPO 高溢价期）。');
  } else if (isNuclear) {
    parts.push('④ 反应堆规模（在运/在建机组、装机容量万千瓦）为<b>基于公开披露信息的整理/估算值</b>，装机容量由台数×平均单机容量反推，逐年精确值需核实；');
    parts.push('⑤ 估值密度指标（基于分红前估值，平均=近4季滚动平均）：「市值/在运万千瓦」=单千瓦在运装机对应估值；「地板估值」=历史最低「单千瓦总规模估值」×当期总规模万千瓦；「天花板估值」=历史最高该估值×当期总规模万千瓦。');
  }
  return '说明：' + parts.join('');
}
