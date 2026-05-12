#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/opt/soil-data"
ENV_DIR="/etc/soil-data"
DATA_DIR="/var/lib/soil-data"
SERVICE_PATH="/etc/systemd/system/soil-data.service"
PNPM_VERSION="10.19.0"

require_root() {
  if [[ "${EUID}" -ne 0 ]]; then
    echo "Run this installer as root on the Proxmox host." >&2
    exit 1
  fi
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

prompt() {
  local label="$1"
  local default_value="${2-}"
  local input=""

  if [[ -n "${default_value}" ]]; then
    read -r -p "${label} [${default_value}]: " input
    printf '%s' "${input:-$default_value}"
    return
  fi

  while [[ -z "${input}" ]]; do
    read -r -p "${label}: " input
  done

  printf '%s' "${input}"
}

prompt_secret() {
  local label="$1"
  local input=""

  while [[ -z "${input}" ]]; do
    read -r -s -p "${label}: " input
    printf '\n'
  done

  printf '%s' "${input}"
}

pct_exec() {
  local ctid="$1"
  local command="$2"
  pct exec "${ctid}" -- bash -lc "${command}"
}

ensure_debian_template() {
  local template_storage="$1"
  local template_name

  template_name="$(pveam available --section system | awk '/debian-12-standard/ {print $2}' | tail -n1)"

  if [[ -z "${template_name}" ]]; then
    echo "Could not discover a Debian 12 standard template via pveam." >&2
    exit 1
  fi

  if ! pveam list "${template_storage}" | awk '{print $2}' | grep -qx "${template_name}"; then
    echo "Downloading ${template_name} to ${template_storage}..."
    pveam download "${template_storage}" "${template_name}"
  fi

  printf '%s' "${template_storage}:vztmpl/${template_name}"
}

build_service_file() {
  local tmp_file="$1"

  cat >"${tmp_file}" <<EOF
[Unit]
Description=Garden soil moisture tracker
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${APP_DIR}
EnvironmentFile=${ENV_DIR}/soil-data.env
ExecStart=/usr/bin/node ${APP_DIR}/src/server.js
Restart=always
RestartSec=5
User=root

[Install]
WantedBy=multi-user.target
EOF
}

build_env_file() {
  local tmp_file="$1"
  local app_key="$2"
  local api_key="$3"
  local mac="$4"
  local sensor_path="$5"
  local poll_interval_ms="$6"

  cat >"${tmp_file}" <<EOF
ECOWITT_APPLICATION_KEY=${app_key}
ECOWITT_API_KEY=${api_key}
ECOWITT_MAC=${mac}
ECOWITT_SENSOR_PATH=${sensor_path}
POLL_INTERVAL_MS=${poll_interval_ms}
PORT=80
HOST=0.0.0.0
DATABASE_PATH=${DATA_DIR}/soil-data.db
EOF
}

main() {
  require_root

  for command in awk curl grep pct pveam tar; do
    require_command "${command}"
  done

  local repo_archive_url
  local ctid
  local hostname
  local bridge
  local rootfs_storage
  local template_storage
  local memory_mb
  local cores
  local disk_gb
  local application_key
  local api_key
  local device_mac
  local sensor_path
  local poll_interval_ms

  repo_archive_url="$(prompt "GitHub repo archive URL" "")"
  ctid="$(prompt "LXC container ID" "210")"
  hostname="$(prompt "Container hostname" "soil-data")"
  bridge="$(prompt "Network bridge" "vmbr0")"
  rootfs_storage="$(prompt "Root filesystem storage" "local-lvm")"
  template_storage="$(prompt "Template storage" "local")"
  memory_mb="$(prompt "Memory in MB" "512")"
  cores="$(prompt "CPU cores" "1")"
  disk_gb="$(prompt "Disk size in GB" "4")"
  application_key="$(prompt_secret "Ecowitt application key")"
  api_key="$(prompt_secret "Ecowitt API key")"
  device_mac="$(prompt "Ecowitt device MAC" "")"
  sensor_path="$(prompt "Ecowitt sensor path" "soil_ch1.soilmoisture")"
  poll_interval_ms="$(prompt "Poll interval in milliseconds" "120000")"

  if pct status "${ctid}" >/dev/null 2>&1; then
    echo "Container ${ctid} already exists. Pick a different CT ID." >&2
    exit 1
  fi

  local template_ref
  template_ref="$(ensure_debian_template "${template_storage}")"

  echo "Creating LXC ${ctid} from ${template_ref}..."
  pct create "${ctid}" "${template_ref}" \
    --arch amd64 \
    --cores "${cores}" \
    --hostname "${hostname}" \
    --memory "${memory_mb}" \
    --net0 "name=eth0,bridge=${bridge},ip=dhcp,type=veth" \
    --onboot 1 \
    --ostype debian \
    --rootfs "${rootfs_storage}:${disk_gb}" \
    --swap 512 \
    --unprivileged 1

  pct start "${ctid}"

  echo "Installing system packages and Node.js..."
  pct_exec "${ctid}" "apt-get update && apt-get install -y ca-certificates curl gnupg build-essential"
  pct_exec "${ctid}" "install -d -m 0755 /etc/apt/keyrings"
  pct_exec "${ctid}" "curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg"
  pct_exec "${ctid}" "printf '%s\n' 'deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main' > /etc/apt/sources.list.d/nodesource.list"
  pct_exec "${ctid}" "apt-get update && apt-get install -y nodejs"
  pct_exec "${ctid}" "npm install -g pnpm@${PNPM_VERSION}"

  local work_dir
  work_dir="$(mktemp -d)"
  trap 'rm -rf "${work_dir}"' EXIT

  echo "Downloading application source archive..."
  curl -fsSL "${repo_archive_url}" -o "${work_dir}/soil-data.tar.gz"

  build_env_file \
    "${work_dir}/soil-data.env" \
    "${application_key}" \
    "${api_key}" \
    "${device_mac}" \
    "${sensor_path}" \
    "${poll_interval_ms}"
  build_service_file "${work_dir}/soil-data.service"

  pct_exec "${ctid}" "mkdir -p ${APP_DIR} ${ENV_DIR} ${DATA_DIR}"
  pct push "${ctid}" "${work_dir}/soil-data.tar.gz" /tmp/soil-data.tar.gz
  pct push "${ctid}" "${work_dir}/soil-data.env" "${ENV_DIR}/soil-data.env"
  pct push "${ctid}" "${work_dir}/soil-data.service" "${SERVICE_PATH}"

  pct_exec "${ctid}" "rm -rf ${APP_DIR}/* && tar -xzf /tmp/soil-data.tar.gz -C ${APP_DIR} --strip-components=1 && rm -f /tmp/soil-data.tar.gz"
  pct_exec "${ctid}" "cd ${APP_DIR} && pnpm install --frozen-lockfile && pnpm build"
  pct_exec "${ctid}" "systemctl daemon-reload && systemctl enable --now soil-data.service"

  local container_ip
  container_ip="$(pct exec "${ctid}" -- hostname -I | awk '{print $1}')"

  echo
  echo "Soil tracker deployed."
  echo "Container ID: ${ctid}"
  echo "IP address: ${container_ip}"
  echo "Open: http://${container_ip}/"
}

main "$@"
