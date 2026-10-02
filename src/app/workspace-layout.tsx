import type { ReactNode, CSSProperties } from 'react';
import {
  CalendarDays,
  ChartNoAxesCombined,
  CheckCheck,
  Clock3,
  HardDrive,
  Settings2,
  Trash2,
} from 'lucide-react';
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuBadge,
  SidebarFooter,
  SidebarInset,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';

const pages = [
  { id: 'workspace', title: '工作日历', icon: CalendarDays },
  { id: 'report', title: '月度报告', icon: ChartNoAxesCombined },
  { id: 'review', title: '待核对', icon: CheckCheck },
  { id: 'trash', title: '回收站', icon: Trash2 },
  { id: 'settings', title: '设置与数据', icon: Settings2 },
];
export function WorkspaceLayout({
  page,
  onPage,
  pendingCount,
  zone,
  children,
}: {
  page: string;
  onPage: (page: string) => void;
  pendingCount: number;
  zone: string;
  children: ReactNode;
}) {
  return (
    <SidebarProvider style={{ '--sidebar-width': '13rem' } as CSSProperties}>
      <Sidebar collapsible="icon">
        <SidebarHeader className="px-3 py-5">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" onClick={() => onPage('workspace')} tooltip="HourTrail">
                <span className="brand-mark">
                  <Clock3 />
                </span>
                <span className="brand-name">
                  HourTrail<small>工作时间记录</small>
                </span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>工作空间</SidebarGroupLabel>
            <SidebarMenu>
              {pages.slice(0, 3).map(({ id, title, icon: Icon }) => (
                <SidebarMenuItem key={id}>
                  <SidebarMenuButton
                    isActive={page === id}
                    onClick={() => onPage(id)}
                    tooltip={title}
                    aria-current={page === id ? 'page' : undefined}
                  >
                    <Icon />
                    <span>{title}</span>
                  </SidebarMenuButton>
                  {id === 'review' && pendingCount > 0 && (
                    <SidebarMenuBadge>{pendingCount}</SidebarMenuBadge>
                  )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="pb-4">
          <SidebarMenu>
            {pages.slice(3).map(({ id, title, icon: Icon }) => (
              <SidebarMenuItem key={id}>
                <SidebarMenuButton
                  isActive={page === id}
                  onClick={() => onPage(id)}
                  tooltip={title}
                >
                  <Icon />
                  <span>{title}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
          <Separator />
          <div className="local-footer">
            <HardDrive />
            <span>
              本地工作区<small>0.1.0 · 离线可用</small>
            </span>
          </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="workspace-header">
          <div className="flex items-center gap-3">
            <SidebarTrigger aria-label="展开或收起导航" />
            <Separator orientation="vertical" className="h-4" />
            <span>{pages.find((p) => p.id === page)?.title}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="header-zone">{zone}</span>
            <Badge variant="outline">
              <HardDrive data-icon="inline-start" />
              本地保存
            </Badge>
          </div>
        </header>
        <main className="workspace-content">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
