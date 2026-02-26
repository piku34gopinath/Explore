export interface NewsCluster {
  id: string;
  name: string;
  tag: string;
  articleCount: number;
  sentiment: 'High' | 'Neutral' | 'Rising' | 'Volatile';
  image: string;
}

export interface VideoClip {
  id: string;
  title: string;
  views: string;
  engagement: number;
  duration: string;
  thumbnail: string;
}

export interface StatMetric {
  label: string;
  value: string;
  change?: string;
  isPositive?: boolean;
  unit?: string;
}

export const mockClusters: NewsCluster[] = [
  {
    id: '1',
    name: 'LLM Efficiency Gains',
    tag: 'Efficiency Gains',
    articleCount: 124,
    sentiment: 'High',
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBW9OMy8eat6yzmmVWMe2uYjtlbHZhRRRpzouT8KtnaeCkOgxRQY8bAxdfWsKbkoLJnld1IY7Jpwboy90z_0ounXETL4wzXg-Z-4i0hVa4w-UXvk9xS7uscbRB-9jq5SvmWFF70Voar0zUEIvVfwEoHSkQDUX4Sirh5RSqxsIpg-w94l_P-oUVf2mTjO63odJKARfHP86fjM9K27p9awwpY2OLIh35n97Wt5xswfDpNAExyHPH4azwJtB4v7jF70RukaYRZ8UyPTpw'
  },
  {
    id: '2',
    name: 'Neuralink Human Trials',
    tag: 'Neurotech',
    articleCount: 89,
    sentiment: 'Neutral',
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDqdKEXcJs0uyuN_ljUsjy2CabTbLP8UBlcvfXcni91yujS-xeqys5CvdJWsJdfPi4sxleATNpKnb6CWzVv_qm0Y-JKbk1vkVfz1K9sA6UsDEy6rCdX_ko8Adkhg8lW_8KFg8i3dR4_-I2ZdgGGy6k-LyHsUO3kvdxz8-G01zGzrzOlxax8aYTSkgN03LN-bDOxopdiBM8Rg0k1jP6rAYR0w8VZwM0KBRNi-GuLRnLsPho6MFyUFqTSB0NY9GboiICggZ03qAdshns'
  },
  {
    id: '3',
    name: 'Quantum Breakthroughs',
    tag: 'Quantum',
    articleCount: 56,
    sentiment: 'Rising',
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCF6THUCCx7OmcrruT2cJqOIyC_6SGUJtVc-fHZhbpl0Aq_9PFuU2tg_nrmdwaoD5OBxd_8vhXNNcpokyfnqHBKTvGgSm_r57em8i7mHqmf11wQRKiBHphc1wS9OK7_5teTrwyIc2IcA5ogbraguG5arZnq-KXaaNfhrRRSupkqdqn8oKM0iTPq0MMi8CZrkEQ3qju8b7eIYEmwCsIyQ23fUijRL_0B8buXEwQDflN0P2T0gyeYBFYnYKmpPysG2XCztEQjuNs6g6A'
  },
  {
    id: '4',
    name: 'Autonomous Swarms',
    tag: 'Robotics',
    articleCount: 210,
    sentiment: 'Volatile',
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBLbQ67PXjrwPX_0QFu-vWGm7aIsDVRAsAvZvZ2QCO8RFZ4qFEADKRdtwsiXW73m-gwJ_d4XCfFfTFtiOLbQCtYTLToS1O_m7fj_N-RVZVgV4OJq02pVxLwmk3SPE-BMh0heR1QF9ukjpc2jd2qm6b2iJM8hAlmnQIze3Xe5bT63m8IqhdwxT7BwYR82X83ZUIgR3aZhdlsapX4d3un6Oqo3pWeqbiniXMRJmi41Y3nZ3cvPr9nJlXjCME8TxQgIVSoWGr9mYBie1s'
  }
];

export const mockVideos: VideoClip[] = [
  {
    id: 'v1',
    title: 'The Future of Generative Agents in Gaming',
    views: '142K Views',
    engagement: 9.8,
    duration: '12:45',
    thumbnail: 'https://lh3.googleusercontent.com/aida-public/AB6AXuD3HqklutVVQCuWMVQu48WO7ZdpEeT-aqi5rMgId2A32qWwCHSXCL8AcD5Wmp16KdWANouCzYE3oJLrs2J7a-YfXRi7ZWLKSzQmNIlYSYYGI6wrzAd0IelY5LGi1Ha0-vDL9IkV_QZlv9NUj9G1Nc9xrih7epSm6-rFb1GhhsfALX1UqK7WwB9HYI0DGgiWUEuWADcm0zZSS8IEYy63RqmwzyHSMxlm9y94hUuDxwgVlnxbbCA8XfwVGlYPzOko9-yOObEHqGio61o'
  },
  {
    id: 'v2',
    title: 'Explaining GPT-5 Potential Architecture',
    views: '89K Views',
    engagement: 8.5,
    duration: '08:12',
    thumbnail: 'https://lh3.googleusercontent.com/aida-public/AB6AXuC89C1GNJZrwrvXTzL2B1xPZ9AAPF7yrE_uFhzdHP5GrxeRaaugJ9Ll-xU8uegFvPELfL44hafYj5sRjf_O4Q4p5brCgjGQwVzTlMi4DXvfIXnSrS4-eNbPWs5_Xp17m-Puin8aefOk6JRLI4Wk9gTJXPmHLqNFJ5ydtaYojOHL_u7xMqsKcpHoVwSvNH-PHT140wNN6w3Irx31gQgDGxa2FeHGeIXOJK0_adcRRxfrXKz5GtaSmd544XBjvaFmvTJE1qB46kjYTsE'
  }
];

export const mockStats: StatMetric[] = [
  { label: 'Articles Today', value: '1,284', change: '+12%', isPositive: true },
  { label: 'Processing Speed', value: '45', unit: 'ms' },
  { label: 'Viral Clips', value: '82', change: '-5%', isPositive: false },
  { label: 'Active Clusters', value: '14' }
];
