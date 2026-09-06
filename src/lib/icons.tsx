import { useEffect, useId, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  FileText,
  AppWindow,
  Activity,
  Boxes,
  Cloud,
  Database,
  Flame,
  Folder,
  GitBranch,
  Globe,
  HardDrive,
  KeyRound,
  Layers,
  LineChart,
  Link,
  ListTodo,
  Mail,
  Monitor,
  Network,
  Server,
  Settings,
  Shield,
  Terminal,
  Wrench,
} from "lucide-react";

export const PRODUCT_ICONS: { slug: string; label: string; src: string }[] = [
  { slug: "vmware", label: "VMware / vCenter", src: "/icons/vmware.png" },
  { slug: "broadcom", label: "Broadcom / SDDC", src: "/icons/broadcom.png" },
  { slug: "cisco", label: "Cisco", src: "/icons/cisco.png" },
  { slug: "infoblox", label: "Infoblox", src: "/icons/infoblox.png" },
  { slug: "openshift", label: "OpenShift", src: "/icons/openshift.png" },
  { slug: "kubernetes", label: "Kubernetes", src: "/icons/kubernetes.png" },
  { slug: "redhat", label: "Red Hat", src: "/icons/redhat.png" },
  { slug: "docker", label: "Docker", src: "/icons/docker.png" },
  { slug: "terraform", label: "Terraform", src: "/icons/terraform.png" },
  { slug: "ansible", label: "Ansible", src: "/icons/ansible.png" },
  { slug: "dell", label: "Dell", src: "/icons/dell.png" },
  { slug: "hpe", label: "HPE", src: "/icons/hpe.png" },
  { slug: "netapp", label: "NetApp", src: "/icons/netapp.png" },
  { slug: "paloalto", label: "Palo Alto", src: "/icons/paloalto.png" },
  { slug: "fortinet", label: "Fortinet", src: "/icons/fortinet.png" },
  { slug: "checkpoint", label: "Check Point", src: "/icons/checkpoint.png" },
  { slug: "f5", label: "F5", src: "/icons/f5.png" },
  { slug: "nginx", label: "Nginx", src: "/icons/nginx.png" },
  { slug: "netbox", label: "NetBox", src: "/icons/netbox.png" },
  { slug: "grafana", label: "Grafana", src: "/icons/grafana.png" },
  { slug: "prometheus", label: "Prometheus", src: "/icons/prometheus.png" },
  { slug: "elasticsearch", label: "Elastic", src: "/icons/elasticsearch.png" },
  { slug: "splunk", label: "Splunk", src: "/icons/splunk.png" },
  { slug: "checkmk", label: "Checkmk", src: "/icons/checkmk.png" },
  { slug: "zabbix", label: "Zabbix", src: "/icons/zabbix.png" },
  { slug: "solarwinds", label: "SolarWinds", src: "/icons/solarwinds.png" },
  { slug: "nexthink", label: "Nexthink", src: "/icons/nexthink.png" },
  { slug: "microsoft", label: "Microsoft 365", src: "/icons/microsoft.png" },
  { slug: "windows", label: "Windows", src: "/icons/windows.png" },
  { slug: "intune", label: "Intune", src: "/icons/intune.png" },
  { slug: "entra", label: "Entra ID", src: "/icons/entra.png" },
  { slug: "citrix", label: "Citrix", src: "/icons/citrix.png" },
  { slug: "crowdstrike", label: "CrowdStrike", src: "/icons/crowdstrike.png" },
  { slug: "servicenow", label: "ServiceNow", src: "/icons/servicenow.png" },
  { slug: "jira", label: "Jira", src: "/icons/jira.png" },
  { slug: "cyberark", label: "CyberArk", src: "/icons/cyberark.png" },
  { slug: "ivanti", label: "Ivanti", src: "/icons/ivanti.png" },
  { slug: "jamf", label: "Jamf", src: "/icons/jamf.png" },
  { slug: "okta", label: "Okta", src: "/icons/okta.png" },
  { slug: "keycloak", label: "Keycloak", src: "/icons/keycloak.png" },
  { slug: "vault", label: "Vault", src: "/icons/vault.png" },
  { slug: "hashicorp", label: "HashiCorp", src: "/icons/hashicorp.png" },
  { slug: "gitlab", label: "GitLab", src: "/icons/gitlab.png" },
  { slug: "bitwarden", label: "Bitwarden", src: "/icons/bitwarden.png" },
  { slug: "linux", label: "Linux", src: "/icons/linux.png" },
  { slug: "ubuntu", label: "Ubuntu", src: "/icons/ubuntu.png" },
  { slug: "postgresql", label: "PostgreSQL", src: "/icons/postgresql.png" },
  { slug: "redis", label: "Redis", src: "/icons/redis.png" },
  { slug: "minio", label: "MinIO", src: "/icons/minio.png" },
  { slug: "tenable", label: "Tenable", src: "/icons/tenable.png" },
  { slug: "openbao", label: "OpenBao", src: "/icons/openbao.svg" },
  { slug: "opentofu", label: "OpenTofu", src: "/icons/opentofu.svg" },
  { slug: "nexus", label: "Nexus / Sonatype", src: "/icons/nexus.svg" },
  { slug: "satellite", label: "Red Hat Satellite", src: "/icons/satellite.svg" },
  { slug: "rancher", label: "Rancher", src: "/icons/rancher.svg" },
  { slug: "harbor", label: "Harbor", src: "/icons/harbor.svg" },
  { slug: "jenkins", label: "Jenkins", src: "/icons/jenkins.svg" },
  { slug: "helm", label: "Helm", src: "/icons/helm.svg" },
  { slug: "consul", label: "Consul", src: "/icons/consul.svg" },
  { slug: "nomad", label: "Nomad", src: "/icons/nomad.svg" },
  { slug: "packer", label: "Packer", src: "/icons/packer.svg" },
  { slug: "nutanix", label: "Nutanix", src: "/icons/nutanix.svg" },
  { slug: "veeam", label: "Veeam", src: "/icons/veeam.svg" },
  { slug: "aws", label: "AWS", src: "/icons/amazonwebservices.svg" },
  { slug: "azure", label: "Azure", src: "/icons/microsoftazure.svg" },
  { slug: "gcp", label: "Google Cloud", src: "/icons/googlecloud.svg" },
  { slug: "mongodb", label: "MongoDB", src: "/icons/mongodb.svg" },
  { slug: "mysql", label: "MySQL", src: "/icons/mysql.svg" },
  { slug: "kafka", label: "Kafka", src: "/icons/apachekafka.svg" },
  { slug: "rabbitmq", label: "RabbitMQ", src: "/icons/rabbitmq.svg" },
  { slug: "datadog", label: "Datadog", src: "/icons/datadog.svg" },
  { slug: "dynatrace", label: "Dynatrace", src: "/icons/dynatrace.svg" },
  { slug: "newrelic", label: "New Relic", src: "/icons/newrelic.svg" },
  { slug: "traefik", label: "Traefik", src: "/icons/traefikproxy.svg" },
  { slug: "istio", label: "Istio", src: "/icons/istio.svg" },
  { slug: "cloudflare", label: "Cloudflare", src: "/icons/cloudflare.svg" },
  { slug: "github", label: "GitHub", src: "/icons/github.svg" },
  { slug: "sonarqube", label: "SonarQube", src: "/icons/sonarqube.svg" },
  { slug: "oracle", label: "Oracle", src: "/icons/oracle.svg" },
  { slug: "juniper", label: "Juniper", src: "/icons/junipernetworks.svg" },
  { slug: "openstack", label: "OpenStack", src: "/icons/openstack.svg" },
  { slug: "proxmox", label: "Proxmox", src: "/icons/proxmox.svg" },
  { slug: "portainer", label: "Portainer", src: "/icons/portainer.svg" },
  { slug: "argo", label: "Argo CD", src: "/icons/argo.svg" },
  { slug: "bitbucket", label: "Bitbucket", src: "/icons/bitbucket.svg" },
  { slug: "confluence", label: "Confluence", src: "/icons/confluence.svg" },
  { slug: "debian", label: "Debian", src: "/icons/debian.svg" },
  { slug: "centos", label: "CentOS", src: "/icons/centos.svg" },
  { slug: "almalinux", label: "AlmaLinux", src: "/icons/almalinux.svg" },
  { slug: "rockylinux", label: "Rocky Linux", src: "/icons/rockylinux.svg" },
  { slug: "fedora", label: "Fedora", src: "/icons/fedora.svg" },
  { slug: "puppet", label: "Puppet", src: "/icons/puppet.svg" },
  { slug: "chef", label: "Chef", src: "/icons/chef.svg" },
  { slug: "salt", label: "Salt", src: "/icons/saltproject.svg" },
  { slug: "icinga", label: "Icinga", src: "/icons/icinga.svg" },
  { slug: "kibana", label: "Kibana", src: "/icons/kibana.svg" },
  { slug: "fluentd", label: "Fluentd", src: "/icons/fluentd.svg" },
  { slug: "opentelemetry", label: "OpenTelemetry", src: "/icons/opentelemetry.svg" },
  { slug: "jaeger", label: "Jaeger", src: "/icons/jaeger.svg" },
  { slug: "atlassian", label: "Atlassian", src: "/icons/atlassian.svg" },
  { slug: "teams", label: "Microsoft Teams", src: "/icons/microsoftteams.svg" },
  { slug: "powerbi", label: "Power BI", src: "/icons/powerbi.svg" },
  { slug: "tableau", label: "Tableau", src: "/icons/tableau.svg" },
  { slug: "nextcloud", label: "Nextcloud", src: "/icons/nextcloud.svg" },
  { slug: "synology", label: "Synology", src: "/icons/synology.svg" },
  { slug: "qnap", label: "QNAP", src: "/icons/qnap.svg" },
  { slug: "truenas", label: "TrueNAS", src: "/icons/truenas.svg" },
  { slug: "ceph", label: "Ceph", src: "/icons/ceph.svg" },
  { slug: "longhorn", label: "Longhorn", src: "/icons/longhorn.svg" },
  { slug: "cilium", label: "Cilium", src: "/icons/cilium.svg" },
  { slug: "linkerd", label: "Linkerd", src: "/icons/linkerd.svg" },
  { slug: "envoy", label: "Envoy", src: "/icons/envoyproxy.svg" },
  { slug: "apache", label: "Apache", src: "/icons/apache.svg" },
  { slug: "ibm", label: "IBM", src: "/icons/ibm.svg" },
  { slug: "lenovo", label: "Lenovo", src: "/icons/lenovo.svg" },
  { slug: "qualys", label: "Qualys", src: "/icons/qualys.svg" },
  { slug: "wireshark", label: "Wireshark", src: "/icons/wireshark.svg" },
  { slug: "authentik", label: "Authentik", src: "/icons/authentik.svg" },
  { slug: "authelia", label: "Authelia", src: "/icons/authelia.svg" },
  { slug: "tekton", label: "Tekton", src: "/icons/tekton.svg" },
  { slug: "github-actions", label: "GitHub Actions", src: "/icons/githubactions.svg" },
  { slug: "keepassxc", label: "KeePassXC", src: "/icons/keepassxc.svg" },
  { slug: "vaultwarden", label: "Vaultwarden", src: "/icons/vaultwarden.svg" },
  { slug: "1password", label: "1Password", src: "/icons/1password.svg" },
  { slug: "lastpass", label: "LastPass", src: "/icons/lastpass.svg" },
  { slug: "bamboo", label: "Bamboo", src: "/icons/bamboo.svg" },
  { slug: "teamcity", label: "TeamCity", src: "/icons/teamcity.svg" },
  { slug: "circleci", label: "CircleCI", src: "/icons/circleci.svg" },
  { slug: "spinnaker", label: "Spinnaker", src: "/icons/spinnaker.svg" },
  { slug: "burpsuite", label: "Burp Suite", src: "/icons/burpsuite.svg" },
  { slug: "owasp", label: "OWASP", src: "/icons/owasp.svg" },
  { slug: "mcafee", label: "McAfee", src: "/icons/mcafee.svg" },
  { slug: "symantec", label: "Symantec", src: "/icons/symantec.svg" },
  { slug: "trendmicro", label: "Trend Micro", src: "/icons/trendmicro.svg" },
  { slug: "databricks", label: "Databricks", src: "/icons/databricks.svg" },
  { slug: "snowflake", label: "Snowflake", src: "/icons/snowflake.svg" },
  { slug: "slack", label: "Slack", src: "/icons/slack.svg" },
  { slug: "qlik", label: "Qlik", src: "/icons/qlik.svg" },
  { slug: "palantir", label: "Palantir", src: "/icons/palantir.svg" },
  { slug: "hitachi", label: "Hitachi", src: "/icons/hitachi.svg" },
  { slug: "fujitsu", label: "Fujitsu", src: "/icons/fujitsu.svg" },
  { slug: "supermicro", label: "Supermicro", src: "/icons/supermicro.svg" },
  { slug: "owncloud", label: "ownCloud", src: "/icons/owncloud.svg" },
  { slug: "veritas", label: "Veritas", src: "/icons/veritas.svg" },
  { slug: "rook", label: "Rook", src: "/icons/rook.svg" },
];

const PRODUCT_SRC = Object.fromEntries(PRODUCT_ICONS.map((p) => [p.slug, p.src]));

export const ICON_OPTIONS: { name: string; label: string; Icon: LucideIcon }[] = [
  { name: "Server", label: "Serveur", Icon: Server },
  { name: "Cloud", label: "Cloud", Icon: Cloud },
  { name: "Boxes", label: "Cubes", Icon: Boxes },
  { name: "Network", label: "Réseau", Icon: Network },
  { name: "Activity", label: "Activité", Icon: Activity },
  { name: "LineChart", label: "Graphique", Icon: LineChart },
  { name: "Flame", label: "Flamme", Icon: Flame },
  { name: "Wrench", label: "Outils", Icon: Wrench },
  { name: "GitBranch", label: "Git", Icon: GitBranch },
  { name: "ListTodo", label: "Taches", Icon: ListTodo },
  { name: "Database", label: "Base", Icon: Database },
  { name: "HardDrive", label: "Stockage", Icon: HardDrive },
  { name: "Shield", label: "Sécurité", Icon: Shield },
  { name: "KeyRound", label: "Acces", Icon: KeyRound },
  { name: "Monitor", label: "Écran", Icon: Monitor },
  { name: "Terminal", label: "Terminal", Icon: Terminal },
  { name: "Globe", label: "Web", Icon: Globe },
  { name: "Mail", label: "Mail", Icon: Mail },
  { name: "Folder", label: "Dossier", Icon: Folder },
  { name: "Layers", label: "Calques", Icon: Layers },
  { name: "Settings", label: "Réglages", Icon: Settings },
  { name: "FileText", label: "Note", Icon: FileText },
  { name: "AppWindow", label: "Fenêtre", Icon: AppWindow },
  { name: "Link", label: "Lien", Icon: Link },
];

const ICON_MAP = Object.fromEntries(ICON_OPTIONS.map((o) => [o.name, o.Icon]));

export function iconifySrc(id: string) {
  const [prefix, ...rest] = id.split(":");
  const name = rest.join(":");
  if (!prefix || !name) return "";
  return `https://api.iconify.design/${prefix}/${name}.svg`;
}

export function resolveIconSrc(name: string): string | null {
  const trimmed = (name || "").trim();
  if (/^(https?:\/\/|data:|\/)/i.test(trimmed)) return trimmed;
  if (PRODUCT_SRC[trimmed]) return PRODUCT_SRC[trimmed];
  return null;
}

export async function fileToDataUrl(file: File): Promise<string> {
  if (file.size > 220_000) throw new Error("Fichier trop lourd (max 200 Ko)");
  const allowed = [
    "image/png",
    "image/svg+xml",
    "image/webp",
    "image/jpeg",
    "image/gif",
    "image/x-icon",
    "image/vnd.microsoft.icon",
  ];
  if (file.type && !allowed.includes(file.type) && !/\.(png|svg|webp|jpe?g|gif|ico)$/i.test(file.name)) {
    throw new Error("Formats : PNG, SVG, WebP, JPEG, ICO");
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Lecture impossible"));
    reader.readAsDataURL(file);
  });
}

export async function toFaviconDataUrl(src: string): Promise<string> {
  const raw = String(src || "").trim();
  if (!raw) return "";
  if (raw.startsWith("data:image/svg") || /\.svg(\?|$)/i.test(raw)) return raw;
  if (raw.includes("image/x-icon") || raw.includes("image/vnd.microsoft.icon") || /\.ico(\?|$)/i.test(raw)) {
    return raw;
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      const size = 64;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(raw);
        return;
      }
      const scale = Math.min(size / Math.max(img.width, 1), size / Math.max(img.height, 1));
      const w = img.width * scale;
      const h = img.height * scale;
      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
      try {
        resolve(canvas.toDataURL("image/png"));
      } catch {
        resolve(raw);
      }
    };
    img.onerror = () => resolve(raw);
    img.src = raw;
  });
}

export async function urlToDataUrl(src: string): Promise<string> {
  const res = await fetch(src);
  if (!res.ok) throw new Error("errors.iconFetchFail");
  const blob = await res.blob();
  if (blob.size > 220_000) throw new Error("errors.iconTooHeavy");
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("errors.generic"));
    reader.readAsDataURL(blob);
  });
}

const DOCKIT_FACES = [
  {
    d: "M24 3.2 43.2 14.3 24 25.4 4.8 14.3 24 3.2z",
    rim: "M4.8 14.3 24 3.2 43.2 14.3",
    fill: 1,
  },
  {
    d: "M4.8 14.3 24 25.4v19.4L4.8 33.7V14.3z",
    rim: "M4.8 14.3 4.8 33.7 24 44.8",
    fill: 0.7,
  },
  {
    d: "M43.2 14.3 24 25.4v19.4l19.2-11.1V14.3z",
    rim: "M43.2 14.3 43.2 33.7 24 44.8",
    fill: 0.88,
  },
];
export function DockitMark({ className }: { className?: string }) {
  const [hot, setHot] = useState<number | null>(null);
  const [built, setBuilt] = useState(false);
  const uid = useId().replace(/:/g, "");
  const live = String(className || "").includes("about-mark");
  useEffect(() => {
    if (!live) {
      setBuilt(true);
      return;
    }
    const wait = window.setTimeout(() => setBuilt(true), 1600);
    return () => window.clearTimeout(wait);
  }, [live]);
  function faceAt(svg: SVGSVGElement, clientX: number, clientY: number): number | null {
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const p = svg.createSVGPoint();
    p.x = clientX;
    p.y = clientY;
    const loc = p.matrixTransform(ctm.inverse());
    const fills = [...svg.querySelectorAll<SVGGeometryElement>(".dockit-fill")];
    for (let i = fills.length - 1; i >= 0; i--) {
      try {
        if (fills[i].isPointInFill(loc)) return i;
      } catch {
        // ignore
      }
    }
    return null;
  }
  return (
    <svg
      viewBox="0 0 48 48"
      className={`${className ?? ""}${live && built ? " is-ready" : ""}`}
      aria-hidden
      onPointerMove={
        live
          ? (e) => {
              const next = faceAt(e.currentTarget, e.clientX, e.clientY);
              setHot((cur) => (cur === next ? cur : next));
            }
          : undefined
      }
      onPointerLeave={live ? () => setHot(null) : undefined}
    >
      <defs>
        {DOCKIT_FACES.map((face, i) => (
          <clipPath key={i} id={`${uid}-f${i}`}>
            <path d={face.d} />
          </clipPath>
        ))}
      </defs>
      {DOCKIT_FACES.map((face, i) => (
        <g key={i} className="dockit-face">
          <path
            className="dockit-fill"
            fill="currentColor"
            d={face.d}
            style={{
              opacity: live && (!built || hot === i) ? 0 : face.fill,
            }}
          />
          <g clipPath={`url(#${uid}-f${i})`}>
            <path className="dockit-stroke" pathLength="1" d={face.d} />
            <path
              className="dockit-rim"
              d={face.rim}
              style={{
                opacity: live && built && hot === i ? 1 : 0,
              }}
            />
          </g>
        </g>
      ))}
      {live ? (
        <rect width="48" height="48" fill="transparent" pointerEvents="all" />
      ) : null}
    </svg>
  );
}

export function BmcMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <rect width="24" height="24" rx="6" fill="#FFDD00" />
      <path
        fill="#0D0C22"
        d="M9.05 5.15c.16.82.4 1.4.68 1.78h.98c-.34-.48-.54-1.12-.62-1.95l-1.04.17zm3.12.12c.12.86.38 1.46.74 1.86h.98c-.4-.5-.62-1.16-.7-2l-1.02.14zM7.35 8.55h7.9v.9h.9a2.2 2.2 0 1 1 0 4.4h-.9v1.15a2.95 2.95 0 0 1-2.95 2.95h-2.9a2.95 2.95 0 0 1-2.95-2.95V8.55zm7.9 1.85v2.55h.9a1.3 1.3 0 0 0 0-2.55h-.9z"
      />
    </svg>
  );
}
export function PortalIcon({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  const trimmed = (name || "").trim();
  const src = resolveIconSrc(trimmed);
  if (src) {
    return (
      <img
        src={src}
        alt=""
        className={`${className ?? ""} object-contain`}
        style={{ objectFit: "contain" }}
        loading="lazy"
        referrerPolicy="no-referrer"
      />
    );
  }
  const Icon = ICON_MAP[trimmed] ?? Link;
  return <Icon className={className} strokeWidth={1.75} />;
}
