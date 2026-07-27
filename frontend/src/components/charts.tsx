import { useMemo } from 'react';
import Chart from 'react-apexcharts';
import type { ApexOptions } from 'apexcharts';
import { classColors, prettyClass } from '../lib/config';

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
const GRID = '#f1f5f9';
const TEXT = '#475569';
const TEXT_STRONG = '#0f172a';
const TEXT_DIM = '#94a3b8';

const baseFont = {
  fontFamily: FONT,
  fontWeight: 500 as const,
};

export function LatencyTimelineChart({ data }: { data: { t: string[]; p50: number[]; p99: number[] } }) {
  const options = useMemo<ApexOptions>(() => ({
    chart: {
      type: 'area',
      height: '100%',
      fontFamily: FONT,
      foreColor: TEXT,
      toolbar: { show: false },
      sparkline: { enabled: false },
      animations: { easing: 'easeinout', speed: 400 },
      background: 'transparent',
    },
    colors: ['#22c55e', '#f97316'],
    stroke: { curve: 'smooth', width: [2.5, 2] },
    dataLabels: { enabled: false },
    fill: {
      type: 'gradient',
      gradient: {
        shadeIntensity: 1,
        opacityFrom: [0.35, 0],
        opacityTo: [0.02, 0],
        stops: [0, 100],
      },
    },
    grid: { borderColor: GRID, strokeDashArray: 3, xaxis: { lines: { show: false } }, yaxis: { lines: { show: true } } },
    xaxis: {
      categories: data.t,
      labels: { style: { ...baseFont, colors: TEXT_DIM, fontSize: '11px' }, datetimeFormatter: { hour: 'HH:mm' } },
      axisBorder: { show: false },
      axisTicks: { show: false },
      crosshairs: { stroke: { color: TEXT_DIM, dashArray: 2 } },
      tooltip: { enabled: false },
    },
    yaxis: {
      labels: { style: { ...baseFont, colors: TEXT_DIM, fontSize: '11px' }, formatter: (v: number) => `${Math.round(v)}ms` },
    },
    legend: {
      position: 'top',
      horizontalAlign: 'right',
      fontSize: '12px',
      fontWeight: 600,
      labels: { colors: TEXT },
      markers: { size: 6, strokeWidth: 0 },
      itemMargin: { horizontal: 8 },
    },
    tooltip: {
      theme: 'light',
      style: { fontSize: '12px', fontFamily: FONT },
      y: { formatter: (v: number) => `${Math.round(v)} ms` },
      marker: { show: true },
    },
    markers: { size: 0, hover: { size: 5, sizeOffset: 3 } },
  }), [data.t]);

  const series = [
    { name: 'p50', data: data.p50 },
    { name: 'p99', data: data.p99 },
  ];

  return <Chart options={options} series={series} type="area" width="100%" height={280} />;
}

const BACKEND_PALETTE = ['#22c55e', '#f97316', '#8b5cf6', '#eab308', '#0ea5e9'];

export function BackendDoughnut({ data }: { data: Record<string, number> }) {
  const labels = Object.keys(data);
  const values = Object.values(data);
  const total = values.reduce((s, v) => s + v, 0);

  const options = useMemo<ApexOptions>(() => ({
    chart: {
      type: 'donut',
      height: '100%',
      fontFamily: FONT,
      foreColor: TEXT,
      background: 'transparent',
      animations: { enabled: true, easing: 'easeinout', speed: 600 },
    },
    labels: labels.length ? labels : ['no data'],
    colors: labels.map((_, i) => BACKEND_PALETTE[i % BACKEND_PALETTE.length]),
    fill: {
      type: 'gradient',
      gradient: {
        type: 'radial',
        shade: 'light',
        shadeIntensity: 0.55,
        gradientToColors: labels.map((_, i) => BACKEND_PALETTE[i % BACKEND_PALETTE.length] + 'b3'),
        inverseColors: false,
        opacityFrom: 1,
        opacityTo: 1,
        stops: [0, 100],
      },
    },
    stroke: { width: 3, colors: ['#ffffff'] },
    plotOptions: {
      pie: {
        donut: {
          size: '68%',
          labels: {
            show: true,
            name: { color: TEXT_DIM, fontSize: '11px', fontWeight: 600, fontFamily: FONT, offsetY: -6 },
            value: {
              color: TEXT_STRONG,
              fontSize: '32px',
              fontWeight: 800,
              fontFamily: FONT,
              offsetY: 6,
              formatter: (v: string) => `${v}`,
            },
            total: {
              show: true,
              label: 'total requests',
              color: TEXT_DIM,
              fontSize: '10px',
              fontWeight: 600,
              fontFamily: FONT,
              formatter: () => `${total}`,
            },
          },
        },
      },
    },
    dataLabels: { enabled: false },
    legend: {
      position: 'bottom',
      fontSize: '13px',
      fontWeight: 600,
      fontFamily: FONT,
      labels: { colors: TEXT },
      markers: { size: 8, strokeWidth: 0, radius: 4 },
      itemMargin: { horizontal: 14, vertical: 6 },
      formatter: (seriesName: string, opts: any) => {
        const val = opts.w.globals.seriesTotals[opts.seriesIndex];
        const pct = total > 0 ? Math.round((val / total) * 100) : 0;
        return `${seriesName}  \u00A0\u00A0${pct}%`;
      },
    },
    tooltip: {
      theme: 'light',
      style: { fontSize: '12px', fontFamily: FONT },
      y: { formatter: (v: number) => `${v} requests` },
    },
  }), [labels, total]);

  const series = values.length ? values : [1];

  return <Chart options={options} series={series} type="donut" width="100%" height={280} />;
}

export function ClassesBar({ data }: { data: Record<string, number> }) {
  const labels = Object.keys(data);
  const values = Object.values(data);
  const colors = labels.map((l) => classColors[l] || '#94a3b8');

  const options = useMemo<ApexOptions>(() => ({
    chart: {
      type: 'bar',
      height: '100%',
      fontFamily: FONT,
      foreColor: TEXT,
      background: 'transparent',
      toolbar: { show: false },
      animations: { enabled: true, easing: 'easeout', speed: 400 },
    },
    colors,
    plotOptions: {
      bar: {
        distributed: true,
        horizontal: true,
        borderRadius: 8,
        barHeight: '70%',
        dataLabels: { position: 'center' },
      },
    },
    fill: {
      type: 'gradient',
      gradient: { gradientToColors: colors.map((c) => `${c}66`), shadeIntensity: 0.5, type: 'horizontal', opacityFrom: 1, opacityTo: 0.75, stops: [0, 100] },
    },
    dataLabels: {
      enabled: true,
      textAnchor: 'middle',
      style: { fontSize: '13px', fontWeight: 700, fontFamily: FONT, colors: ['#fff'] },
      dropShadow: { enabled: true, top: 1, left: 0, blur: 2, opacity: 0.5 },
      formatter: (_: number, opts: any) => `${opts.w.globals.series[opts.seriesIndex][opts.dataPointIndex]}`,
    },
    grid: { borderColor: GRID, strokeDashArray: 3, xaxis: { lines: { show: true } }, yaxis: { lines: { show: false } }, padding: { left: 8, right: 32 } },
    xaxis: {
      categories: labels.map(prettyClass),
      labels: { style: { ...baseFont, colors: TEXT_DIM, fontSize: '11px' } },
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    yaxis: {
      labels: { style: { ...baseFont, colors: TEXT, fontSize: '13px', fontWeight: 600 }, offsetY: 0 },
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    legend: { show: false },
    tooltip: { theme: 'light', style: { fontSize: '12px', fontFamily: FONT }, y: { formatter: (v: number) => `${v} detections` }, x: { formatter: (_: number, opts: any) => labels[opts.dataPointIndex] ? prettyClass(labels[opts.dataPointIndex]) : '' } },
  }), [labels, colors]);

  const series = [{ name: 'detections', data: values.length ? values : [0] }];

  return <Chart options={options} series={series} type="bar" width="100%" height={280} />;
}
