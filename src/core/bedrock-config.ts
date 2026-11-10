import { ProviderConfigurationError, record } from './provider-validation.ts';

/** Non-secret selection only. AWS owns credential resolution during approved work. */
export interface BedrockSettings {
  region: string;
  profile?: string;
}

export function validateBedrock(raw: unknown): BedrockSettings {
  if (
    !record(raw) ||
    Object.keys(raw).some((key) => !['region', 'profile'].includes(key)) ||
    typeof raw.region !== 'string' ||
    !/^(?:(?:af|ap|ca|eu|il|me|mx|sa|us)-[a-z]+|us-gov-(?:east|west))-[1-9][0-9]?$/.test(
      raw.region,
    ) ||
    (raw.profile !== undefined &&
      (typeof raw.profile !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(raw.profile)))
  )
    throw new ProviderConfigurationError(
      'codex.bedrock accepts an explicit AWS region in the commercial or GovCloud partition and an optional profile name only. China and isolated partitions are unsupported. Credential values, endpoint overrides, and arbitrary AWS options are not accepted.',
    );
  return { region: raw.region, ...(raw.profile === undefined ? {} : { profile: raw.profile }) };
}

/** Keep the previewed native AWS destination independent of ambient endpoint overrides. */
export function validateBedrockEnvironment(
  environment: Record<string, string | undefined> = process.env,
): void {
  if (
    Object.keys(environment).some(
      (name) => /^AWS_ENDPOINT_URL(?:_|$)/i.test(name) && environment[name]?.trim(),
    )
  )
    throw new ProviderConfigurationError(
      'Native Bedrock routing does not accept AWS_ENDPOINT_URL overrides. Remove the override or configure a supported custom gateway explicitly. No endpoint value was exposed and no request was sent.',
    );
}

/** Native Mantle Responses endpoint. Region is validated before interpolation. */
export function bedrockBaseUrl(settings: BedrockSettings): string {
  const { region } = validateBedrock(settings);
  return `https://bedrock-mantle.${region}.api.aws/openai/v1`;
}
